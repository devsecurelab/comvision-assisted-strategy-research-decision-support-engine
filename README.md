# ComVision-Assisted Strategy Research & Decision-Support Engine

**Strategy Specification:** 9-Stage Frozen Strategy Pipeline (Specification v3.4)  
**Canonical Configuration Hash:** `1fc0ff3b17b2a077fdaf532615e7ca4ae2b38b36cdfc781059aeda3e7977b9b8`  
**Active Controlled Experiment:** `EXP-2026-001` (100 Valid Setups Scope Freeze)  
**System Classification:** Quantitative Market Research & Decision-Support Engine (Strict Non-Execution Covenant)

---

## 1. System Overview & Architectural Covenant

The **ComVision-Assisted Strategy Research & Decision-Support Engine** is a deterministic quantitative research and decision-support platform designed to ingest multi-source candle data and computer vision feeds, evaluate candidate market setups through an authoritative 9-stage sequential validation pipeline, compute cryptographic SHA-256 telemetry chains, and output decision-support alerts for human research analysts.

### Strict Non-Execution Covenant
Under no circumstances does this engine connect to broker APIs, transmit orders, manage positions, or execute automated trades:
- **No Broker API Credentials:** The system does not store or accept broker API keys or trade execution tokens.
- **Terminal System Output:** The engine terminates strictly at `system_decision = PASS` with `final_action = MANUAL_ALERT`.
- **Human Authority:** All market entries, position sizing, risk management, and order placement remain exclusively the manual responsibility of the human researcher.

### Target Deployment Topology
```
┌────────────────────────────────────────────────────────┐
│                   GitHub Repository                    │
│   (Central source-code repository & version control)   │
└───────────────────────────┬────────────────────────────┘
                            │ git clone / git pull
                            ▼
┌────────────────────────────────────────────────────────┐
│               Android Device + Termux                  │
│       (Temporary Self-Hosted Node.js Server)           │
│  - Express backend (server.ts / build/server.cjs)      │
│  - 9-Stage Deterministic Pipeline                      │
│  - Durable JSON Storage (data/)                        │
│  - Server-Side Admin Authentication                    │
│  - Telegram / Email Research Alerts                    │
│  - Static PWA Web Client Hosting (port 3000)           │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / WebSocket / JSON
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Client: Browser / PWA                  │
│   (Android Chrome "Add to Home Screen" or Desktop)     │
│  - Standalone PWA UI (Service Worker + Manifest)       │
│  - Dynamic / Configurable Backend Endpoint             │
│  - Zero client-side secrets                            │
└────────────────────────────────────────────────────────┘
```

---

## 2. Termux Compatibility & Android Setup Guide

The backend engine is engineered to run seamlessly on Android devices inside the **Termux** environment using standard Node.js LTS, with zero dependence on AI Studio development-only preview runtimes.

### 2.1 Prerequisites on Android
1. Install **Termux** (recommended: from [F-Droid](https://f-droid.org/packages/com.termux/) or GitHub Releases, NOT from Google Play Store which is deprecated).
2. Install **Termux:API** (optional, recommended for battery monitoring and wake-lock management).

### 2.2 Exact Termux Terminal Setup Commands

Open Termux and run the following commands in order:

```bash
# Step 1: Update package lists and base utilities
pkg update && pkg upgrade -y

# Step 2: Install Git, GitHub CLI, Node.js LTS, and Python (for the Step 0 probe)
pkg install git gh nodejs-lts python -y

# Step 3: Verify versions (Node >= 20.x required, Node 22.x LTS recommended)
node -v
npm -v
git --version

# Step 4: Authenticate to GitHub (the repository is private)
gh auth login --hostname github.com --git-protocol https --web
gh auth status

# Step 5: Clone the private repository into the documented local folder
gh repo clone devsecurelab/comvision-assisted-strategy-research-decision-support-engine comvision-engine
cd comvision-engine

# Step 6: Install the exact locked dependencies
npm ci

# Step 7: Configure environment variables locally (the .env file is Git-ignored)
test -f .env || cp .env.example .env
mkdir -p "$HOME/.local/share/comvision-engine"
nano .env
# Set DATA_DIR to the absolute output of: realpath "$HOME/.local/share/comvision-engine"
# Set SESSION_SECRET (32+ characters) and ADMIN_BOOTSTRAP_PASSWORD (12+ characters).
# Keep HOST=127.0.0.1 and ALLOW_LAN=false. Set GITHUB_REPOSITORY and a read-only
# GITHUB_TOKEN with repository-metadata access to verify the repository is private.
# Add Twelve Data only if authorized; all secrets stay server-side. Save with Ctrl+O, Enter, Ctrl+X.

# Step 8: Build the production bundle (builds client assets and standalone server.cjs)
npm run build

# Step 9: Run the automated verification test suite
npm test

# Step 10: Preview Termux safety checks without wake-lock or service start
chmod 700 scripts/termux/boot.sh scripts/termux/health.sh
TERMUX_DRY_RUN=1 scripts/termux/boot.sh
```

### 2.3 Starting, Stopping & Restarting the Backend on Termux

#### Recommended: supervised boot wrapper
```bash
# Run the safe preflight again, acquire a wake lock, start the service once,
# and wait up to 60 seconds for the local /health endpoint.
scripts/termux/boot.sh

# Secret-free local liveness check. Rich /status requires an approved login.
scripts/termux/health.sh

# Resolve the private state directory without sourcing or printing .env values.
DATA_DIR="$(node scripts/termux/preflight.cjs --root "$PWD" --dry-run --print-data-dir)"
# Stop using the recorded PID (do not launch a second process manager):
kill "$(cat "$DATA_DIR/termux/service.pid")"
```

Open **http://127.0.0.1:3000** in the browser on the Android device. The default is loopback-only; LAN binding (`HOST=0.0.0.0`) is rejected unless `ALLOW_LAN=true` is explicitly set. The wrapper never copies or resets persisted `scanLoopState`. Without a valid fresh provider response, scans fail closed and produce no alert.

#### Optional: foreground diagnostics
```bash
npm start
```

For boot-after-reboot, install the Termux:Boot add-on and run:

```bash
mkdir -p "$HOME/.termux/boot"
ln -sf "$PWD/scripts/termux/boot.sh" "$HOME/.termux/boot/comvision"
```

Do not combine it with PM2/nohup; the wrapper intentionally enforces a single instance. Configure `TERMUX_DEADMAN_URL` only with an explicit HTTPS URL that contains no credentials, query, or fragment; it sends only `{"status":"ok"}`.

### 2.4 Pulling Future GitHub Updates Safely
When new commits are pushed, pull and rebuild safely without touching `.env` or the separately configured persistent `DATA_DIR`:

```bash
cd ~/comvision-engine

# 1. Pull latest verified changes from GitHub
git pull --ff-only origin main

# 2. Update locked dependencies
npm ci

# 3. Rebuild production bundle
npm run build

# 4. Verify test suite
npm test

# 5. Stop the recorded process and restart through the validated wrapper
DATA_DIR="$(node scripts/termux/preflight.cjs --root "$PWD" --dry-run --print-data-dir)"
kill "$(cat "$DATA_DIR/termux/service.pid")" 2>/dev/null || true
scripts/termux/boot.sh
```

---

## 3. Persistent Operation & Android Reality Check

### 3.1 Android Runtime Limitations (Read Before Operating)
An Android smartphone is a battery-constrained consumer mobile device, **not a carrier-grade server**. The system architecture must accommodate the following Android platform realities:

1. **Android Battery Optimization / Doze Mode:** Android aggressively kills long-running background processes or throttles CPU execution when the screen turns off.
   - **Remedy:** Open Android Settings → Apps → Termux → Battery → Set to **Unrestricted** (Don't optimize).
2. **CPU Sleep (Kernel Suspend):** When screen is locked, Android puts the SoC to deep sleep, pausing JavaScript event loops.
   - **Remedy:** Always execute `termux-wake-lock` in Termux before running the server. A persistent notification "Termux (wake lock held)" will appear in your status bar.
3. **OEM Aggressive Process Killers (Phantom Process Killer):** Android 12+ limits background child processes to 32 per app and terminates apps exceeding memory thresholds.
   - **Remedy:** Avoid memory leaks; keep Termux open in the recent apps overview; on Samsung/Xiaomi devices disable "App sleep" and "Battery saver" for Termux.
4. **Device Reboots:** If the phone restarts, runs out of battery, or is power-cycled, Termux processes do NOT restart automatically by default.
   - **Remedy:** Use the `Termux:Boot` add-on with the supervised `scripts/termux/boot.sh` wrapper described above, or relaunch Termux and run that wrapper manually.
5. **Wi-Fi Power Saving:** Some Android kernels throttle or disconnect Wi-Fi when locked.
   - **Remedy:** In Wi-Fi advanced settings, ensure "Keep Wi-Fi on during sleep" is enabled, or connect phone to AC charger while serving.

> ⚠️ **Explicit Covenant:** Do not claim or expect guaranteed 24/7 five-nines uptime on an Android smartphone. Termux hosting is designed for personal research, ad-hoc mobile self-hosting, and local field decision-support.

---

## 4. Local Frontend & Backend Connection

### 4.1 Access Modes
The backend binds to `127.0.0.1:3000` by default. LAN access is an explicit opt-in requiring both `HOST=0.0.0.0` and `ALLOW_LAN=true`:

| Client Location | How to Access | Configured Backend Endpoint |
|---|---|---|
| **Same Phone (Localhost)** | Open Chrome on phone → `http://localhost:3000` | Same-origin (`""`) or `http://localhost:3000` |
| **LAN Devices (Laptop, Tablet, Desktop)** | Only after the explicit LAN opt-in above | Same-origin (`""`) or `http://<PHONE_LAN_IP>:3000` |
| **Separately Hosted / PWA Client** | Only after the explicit LAN opt-in above | Open **Settings** → **Backend Endpoint** → Enter `http://<PHONE_LAN_IP>:3000` |

`/health` is a minimal liveness endpoint. Detailed `/status` operational data (including provider budget and payout freshness) requires an authenticated, approved user; do not expose it publicly.

*To find your phone's LAN IP inside Termux, run:*
```bash
ifconfig | grep "inet "
# Or:
ip addr show wlan0
```

### 4.2 Configurable Endpoint UI
The frontend client includes dynamic endpoint routing via `src/config/api.ts`:
1. In the application header, click the **Settings** gear icon.
2. In the **Backend Server Endpoint** card, enter the exact URL of your Termux backend (e.g. `http://192.168.1.150:3000`).
3. Click **Save Endpoint**.
4. The client saves this preference to browser `localStorage` (`comvision_api_base_url`) and routes all future API requests directly to your Termux server without requiring code recompilation.

---

## 5. Progressive Web App (PWA) & Add to Home Screen

The client is configured as an installable Progressive Web Application using `vite-plugin-pwa`:
- **Web App Manifest:** `dist/manifest.webmanifest` with standalone display mode, dark theme `#090d16`, and high-resolution icons (192px, 512px, maskable 512px).
- **Service Worker:** Offline asset caching for UI static resources, with immediate passthrough for `/api/*` endpoints to ensure live data freshness.

### How to Install on Android
1. Start the Termux backend (`npm run start`).
2. Open Google Chrome on your Android phone and navigate to `http://localhost:3000` (or `http://<PHONE_LAN_IP>:3000`).
3. Tap the **three dots menu (⋮)** in the top right corner of Chrome.
4. Tap **Add to Home screen** (or **Install App**).
5. Confirm name "ComVision".
6. The app installs to your Android launcher as a standalone fullscreen application that operates identically to a native app while communicating with your local Termux backend.

### Step 0: Verify live provider data from Termux

After the Step 0 update has reached `main`, update and build the local copy:

```bash
cd ~/comvision-engine
git pull --ff-only origin main
npm run build
npm run start
```

In a second Termux session, run:

```bash
pkg install python
python3 scripts/termux_step0_probe.py
```

If Python is already installed, the `pkg install` line can be skipped.

The helper prompts for the ComVision administrator email and password (password input is hidden), keeps the temporary session token in memory, and revokes that session after the probe. Market-data API keys remain only in the server-side `.env`; the helper never reads or prints them. It makes six provider-health requests for three pilot pairs at 15m and 1h on Twelve Data only; these may consume provider credits. The JSON output contains provider health and candle data, but no passwords, tokens, or API keys.

If the server is not at `http://127.0.0.1:3000`, set `COMVISION_BASE_URL` before running the helper. Save the JSON results with their timestamps for the Step 0 review; this probe does not generate a trading signal.

---

## 6. Security Architecture & Threat Boundary

### 6.1 Server-Side Secret Isolation
- **Telegram Bot Tokens, SMTP passwords, and API keys** are stored strictly server-side in `.env`.
- They are NEVER bundled into the client JavaScript bundle, NEVER sent to the browser, and NEVER exposed in API responses.
- The `/api/notifications/status` endpoint returns boolean status flags only (`telegramConfigured: true/false`), masking chat IDs.
- Telegram error handlers automatically strip bot token regex patterns from all logged or emitted error strings.
- The detailed `/status` snapshot is restricted to approved users; only `/health` exposes minimal liveness (`ok` and UTC timestamp).

### 6.2 Administrative Authentication & RBAC
- Built-in asynchronous scrypt password hashing with cryptographic salt and timing-safe equality checks.
- All environments require an explicit `DATA_DIR`; production additionally requires `SESSION_SECRET` (32+ chars) and `ADMIN_BOOTSTRAP_PASSWORD` (12+ chars). Bootstrap credentials are never written to disk, and the legacy plaintext `.admin_bootstrap_secret` is removed from that exact data directory or startup fails.
- Registration is disabled by default; when enabled, a rolling-hour limiter applies per IP and globally, malformed attempts are counted, and concurrent duplicate emails/pending approvals are reserved atomically.
- User accounts require administrator approval (`PENDING` → `APPROVED`).
- Analyst accounts cannot modify system users or access security audit logs.

### 6.3 Network Boundary & Internet Exposure Warning
- **Default State:** The engine is intended for `localhost` and private local area network (LAN) usage.
- ⛔ **DO NOT configure port-forwarding on your home router** to expose port 3000 directly to the public internet.
- If remote access outside your home Wi-Fi is needed, use encrypted private mesh networking such as **Tailscale**, **WireGuard**, or a **Cloudflare Zero Trust Tunnel** with email OTP access control.

### 6.4 Startup Self-check Policy
- **Blocks startup:** invalid runtime/host configuration, changed/invalid session or market-calendar identity, invalid broker display offset, unavailable/unwritable/low-capacity `DATA_DIR`, a corrupt signal ledger, or a verified public repository when `GITHUB_REPOSITORY` is configured.
- **Degrades with a safe operational alert:** provider key/price probe failure, Telegram credential probe failure, clock state not yet verified or outside the configured drift bound, and missing repository identity. No secrets or raw request URLs are included in the alert. A provider candle whose server clock fails validation is rejected by the data-provider quality gate, so no signal is generated from it.
- Startup checks are independent and their names, safe error codes, and severity are returned in the protected `/status` snapshot; only minimal liveness is exposed by `/health`.

---

## 7. RDP Strategy V3.0 (Frozen) Specifications & Verification

### 7.1 Master Manifest Verification
- **Strategy Version:** `RDP_STRATEGY_V3.0`
- **Active Experiment:** `EXP-2026-V2-001` (100 Valid Setups)
- **Canonical Configuration Hash:**
  ```
  1fc0ff3b17b2a077fdaf532615e7ca4ae2b38b36cdfc781059aeda3e7977b9b8
  ```
- **EXP-2026-V2-001 Candidate/Outcome Status:** Clean state. Zero premature candidate or outcome records in production storage.

### 7.2 Deterministic Test Suite
Run the test suite at any time to verify cryptographic integrity:
```bash
npm test
```
The current verification suite covers the 19-stage pipeline, boundary edge cases, session revocation, token sanitation, momentum baseline formulas, SHA-256 telemetry chaining, and live-provider adapter diagnostics.

---

## 8. Available Scripts Reference

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `tsx server.ts` | Starts full-stack dev server with live Vite middleware |
| `npm run build` | `vite build && esbuild server.ts ...` | Compiles frontend to `dist/` and backend to `build/server.cjs` |
| `npm run start` | `node build/server.cjs` | Launches standalone compiled production server |
| `npm test` | Configured TypeScript test suite | Runs PR-7 startup/session/operations tests plus the full strategy, safety, R8 and provider regression suite |
| `npm run lint` | `tsc --noEmit` | Validates TypeScript types across whole codebase |
| `npm run clean` | `rm -rf dist server.js` | Cleans production build output directory |
