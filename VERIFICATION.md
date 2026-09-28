# ComVision v2.0 Android Package — Verification Report

**Source archive:** `comvision.zip`  
**Archive SHA-256:** `60cfd6b267b94ac174e18ad4d35b266471a81082909185a46e559c881793a039`

## What this package is

This is a **standalone Android/Jetpack Compose implementation** of the ComVision v2.0 support engine. It is not a patch-only folder for the previous Node/Termux server. The repository contains Kotlin engine, provider adapters, strategy pipeline, Vision evidence model, notification service, Dashboard, Vision, Analytics, and Admin screens.

The outer archive also contained nested release ZIPs. Those nested archives are intentionally excluded from the GitHub source branch; the extracted source project is the canonical upload.

## Feature audit

- 40 canonical pairs and pair catalogue: present
- Single-pair selection: present
- Multi-market selection: present
- Major/Minor/All pair filters: present
- Pair search: present
- Provider adapters: Replay, Twelve Data, Alpha Vantage
- Strategy pipeline: present
- Vision evidence binding and overlays: present
- Capture start/stop state: present
- OCR confidence and verification states: present
- Telegram notification configuration/test: present
- Email/SMTP configuration/test: present
- Admin/Analyst model and status controls: present
- Audit records: present
- Non-execution boundary: present
- Deterministic RDP test suite: present

## Verification performed

### Unit tests

Command:

```bash
gradle test --no-daemon --console=plain
```

Result: **PASS — Gradle BUILD SUCCESSFUL**

The Gradle test task completed successfully, including the RDP suite and the 71-point strategy suite.

### Debug APK build

Command:

```bash
gradle assembleDebug --no-daemon --console=plain
```

Result: **PASS — Gradle BUILD SUCCESSFUL**

Artifact:

```text
app/build/outputs/apk/debug/app-debug.apk
```

### Build notes

- The original archive did not include a usable local Android SDK path; verification used a temporary sandbox Android SDK.
- The original outer archive did not provide the debug keystore at project root; a temporary local debug keystore was generated only for verification and is not included in the upload branch.
- `google-services.json` is not included. Gradle reported the Google Services warning, but unit tests and debug APK assembly completed successfully.
- No `.env`, API key, Telegram token, SMTP password, runtime data, or signing keystore is included in the upload branch.

## Upload policy

This verified Android source is uploaded to a separate Git branch so the existing Node/Termux `main` branch is not destructively replaced. The branch can be reviewed, merged, or replaced later after explicit confirmation.
