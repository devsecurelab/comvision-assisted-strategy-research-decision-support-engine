#!/usr/bin/env python3
"""Run the authenticated Step 0 market-data probes from Termux.

Provider API keys stay in the server's local .env. This script prompts for the
ComVision admin password without echoing it, keeps the temporary session token
in memory, never prints either credential, and logs out the temporary session.
"""

from __future__ import annotations

import getpass
import json
import os
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = os.environ.get("COMVISION_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
PAIRS = ("EUR/USD", "GBP/USD", "USD/JPY")
TIMEFRAMES = ("15m", "1h")


def request_json(path: str, *, method: str = "GET", body: dict[str, Any] | None = None,
                 token: str | None = None) -> tuple[int, dict[str, Any]]:
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=25) as response:
            payload = response.read().decode("utf-8", errors="replace")
            return response.status, parse_json(payload)
    except HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        return error.code, parse_json(payload)
    except (URLError, TimeoutError, OSError) as error:
        # Do not echo URLs, credentials, or potentially sensitive low-level details.
        return 0, {"status": "LOCAL_REQUEST_FAILED", "error_type": type(error).__name__}


def parse_json(value: str) -> dict[str, Any]:
    try:
        decoded = json.loads(value)
        return decoded if isinstance(decoded, dict) else {"response": decoded}
    except (json.JSONDecodeError, TypeError):
        return {"status": "NON_JSON_RESPONSE"}


def emit(record: dict[str, Any]) -> None:
    print(json.dumps(record, ensure_ascii=False, sort_keys=True))


def main() -> int:
    email = input("ComVision admin email: ").strip()
    password = getpass.getpass("ComVision admin password (hidden): ")
    status, login = request_json(
        "/api/auth/login", method="POST", body={"email": email, "password": password}
    )
    password = ""  # Drop the local reference immediately after login.
    if status == 0:
        emit({
            "status": "SERVER_UNREACHABLE",
            "http_status": 0,
            "base_url": BASE_URL,
            "reason": "No HTTP response. Start the backend in the first Termux session or set COMVISION_BASE_URL to its actual local port.",
        })
        return 1
    token = login.get("token")
    if status != 200 or login.get("success") is not True or not isinstance(token, str):
        emit({"status": "LOGIN_FAILED", "http_status": status,
              "reason": login.get("message", "Admin login was not accepted.")})
        return 1

    if not isinstance(login.get("user"), dict) or login["user"].get("role") != "ADMIN":
        # Revoke the session rather than continuing with an analyst account.
        request_json("/api/auth/logout", method="POST", token=token)
        emit({"status": "ADMIN_ROLE_REQUIRED"})
        return 1

    emit({"status": "LOGIN_OK", "message": "Temporary session will be revoked when probes finish."})
    try:
        # Six Twelve Data requests; the server-side provider scheduler enforces spacing.
        for pair in PAIRS:
            for timeframe in TIMEFRAMES:
                query = urlencode({"provider": "TWELVE_DATA", "symbol": pair, "timeframe": timeframe})
                http_status, result = request_json(f"/api/engine/provider-health?{query}", token=token)
                emit({"http_status": http_status, **result})
                time.sleep(1)

    finally:
        logout_status, _ = request_json("/api/auth/logout", method="POST", token=token)
        emit({"status": "TEMPORARY_SESSION_REVOKED" if logout_status == 200 else "LOGOUT_UNCONFIRMED"})
        token = ""

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Probe interrupted; any temporary session will expire within 24 hours.", file=sys.stderr)
        raise SystemExit(130)
