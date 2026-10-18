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
│  - Express backend (server.ts / dist/server.cjs)       │
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
nano .env
# Add only server-side provider keys you are entitled to use; never commit or share these secrets.
# Automatic scan order: Twelve Data -> OANDA Practice -> Tiingo FX.
# Tiingo FX REST is beta; verify timezone/resampling in your account before operational use.
# The dashboard selector is for direct feed requests; scanner failover order is fixed.
# See docs/evidence/provider-adapter-contracts-2026-10-16.md for API, quota and volume caveats.
# Save with Ctrl+O, Enter, then Ctrl+X. Keep HOST=127.0.0.1 for this-phone-only access.

# Step 8: Build the production bundle (builds client assets and standalone server.cjs)
npm run build

# Step 9: Run the automated verification test suite
npm test
```

### 2.3 Starting, Stopping & Restarting the Backend on Termux

#### Method A: Foreground Execution (for testing & interactive logs)
```bash
# Start standalone production server:
npm start

# To stop: press Ctrl + C
```

Open **http://127.0.0.1:3000** in the browser on the Android device. With `HOST=127.0.0.1`, the server is reachable only from that device; set `HOST=0.0.0.0` only if you intentionally want other devices on your network to connect. Without a configured provider and a valid fresh response, scans fail closed and produce no alert; replay is for demo/testing only. Provider entitlements vary by account.

#### Method B: Persistent Background Execution with PM2 (Recommended)
```bash
# Install pm2 globally inside Termux:
npm install -g pm2

# Acquire Termux wake-lock to prevent CPU sleep:
termux-wake-lock

# Start the application as a managed daemon:
pm2 start dist/server.cjs --name comvision

# Check process status and RAM usage:
pm2 status

# View live streaming server logs:
pm2 logs comvision

# Restart the application:
pm2 restart comvision

# Stop the application:
pm2 stop comvision
```

#### Method C: Background Execution with nohup (Lightweight alternative)
```bash
# Acquire wake lock:
termux-wake-lock

# Launch in background redirecting logs:
nohup node dist/server.cjs > server.log 2>&1 &

# Monitor logs:
tail -f server.log

# Stop the process:
pkill -f "node dist/server.cjs"
```

### 2.4 Pulling Future GitHub Updates Safely
When new commits are pushed to your GitHub repository, pull and rebuild safely on Termux without touching your local `.env` or persistent runtime data in `data/`:

```bash
cd ~/comvision-engine

# 1. Pull latest verified changes from GitHub
git pull --ff-only origin main

# 2. Update dependencies if package.json changed
npm install

# 3. Rebuild production bundle
npm run build

# 4. Verify test suite
npm test

# 5. Restart backend process
pm2 restart comvision
# Or if using nohup:
# pkill -f "node dist/server.cjs" && nohup node dist/server.cjs > server.log 2>&1 &
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
   - **Remedy:** Use the `Termux:Boot` addon app if automatic startup after phone reboot is required, or manually relaunch Termux and run `pm2 resurrect` / `npm run start`.
5. **Wi-Fi Power Saving:** Some Android kernels throttle or disconnect Wi-Fi when locked.
   - **Remedy:** In Wi-Fi advanced settings, ensure "Keep Wi-Fi on during sleep" is enabled, or connect phone to AC charger while serving.

> ⚠️ **Explicit Covenant:** Do not claim or expect guaranteed 24/7 five-nines uptime on an Android smartphone. Termux hosting is designed for personal research, ad-hoc mobile self-hosting, and local field decision-support.

---

## 4. Local Frontend & Backend Connection

### 4.1 Access Modes
The backend binds to `0.0.0.0:3000` by default:

| Client Location | How to Access | Configured Backend Endpoint |
|---|---|---|
| **Same Phone (Localhost)** | Open Chrome on phone → `http://localhost:3000` | Same-origin (`""`) or `http://localhost:3000` |
| **LAN Devices (Laptop, Tablet, Desktop)** | Open browser on PC → `http://<PHONE_LAN_IP>:3000` | Same-origin (`""`) or `http://<PHONE_LAN_IP>:3000` |
| **Separately Hosted / PWA Client** | Open hosted PWA URL | Open **Settings** → **Backend Endpoint** → Enter `http://<PHONE_LAN_IP>:3000` |

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

### 6.2 Administrative Authentication & RBAC
- Built-in scrypt password hashing with cryptographic salt and timing-safe equality checks.
- Default administrator bootstrapped via `ADMIN_BOOTSTRAP_KEY` env var or written to protected `data/.admin_bootstrap_secret` (mode 0600).
- User accounts require administrator approval (`PENDING` → `APPROVED`).
- Analyst accounts cannot modify system users or access security audit logs.

### 6.3 Network Boundary & Internet Exposure Warning
- **Default State:** The engine is intended for `localhost` and private local area network (LAN) usage.
- ⛔ **DO NOT configure port-forwarding on your home router** to expose port 3000 directly to the public internet.
- If remote access outside your home Wi-Fi is needed, use encrypted private mesh networking such as **Tailscale**, **WireGuard**, or a **Cloudflare Zero Trust Tunnel** with email OTP access control.

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
| `npm run build` | `vite build && esbuild server.ts ...` | Compiles frontend to `dist/` and backend to `dist/server.cjs` |
| `npm run start` | `node dist/server.cjs` | Launches standalone compiled production server |
| `npm test` | Configured TypeScript test suite | Runs the automated V3 strategy, safety, R8, and provider verification suite |
| `npm run lint` | `tsc --noEmit` | Validates TypeScript types across whole codebase |
| `npm run clean` | `rm -rf dist server.js` | Cleans production build output directory |
