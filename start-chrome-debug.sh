#!/usr/bin/env bash
# OPENCLAW_CHROME_PROFILE_V2
# ====== OpenClaw - Chrome (Mac/Linux) ======
set -e
echo "====== OpenClaw - Chrome ======"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  [ ! -f "$CHROME_BIN" ] && CHROME_BIN="/Applications/Chromium.app/Contents/MacOS/Chromium"
  [ ! -f "$CHROME_BIN" ] && CHROME_BIN="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
  REAL_PROFILE="$HOME/Library/Application Support/Google/Chrome"
  DEFAULT_DEBUG_PROFILE="$HOME/Library/Application Support/OpenClaw/chrome-profile"
else
  CHROME_BIN="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium-browser || command -v chromium || echo '')"
  REAL_PROFILE="$HOME/.config/google-chrome"
  DEFAULT_DEBUG_PROFILE="$HOME/.config/openclaw/chrome-profile"
fi
[ -n "$CHROME_DEBUG_BIN" ] && CHROME_BIN="$CHROME_DEBUG_BIN"

if [ -z "$CHROME_BIN" ] || { [ ! -f "$CHROME_BIN" ] && [ ! -x "$CHROME_BIN" ]; }; then
  echo -e "\033[31mERROR: Chrome/Chromium not found.\033[0m"
  echo "Install Chrome or: export CHROME_DEBUG_BIN=/path/to/chrome"
  exit 1
fi

# Chrome 136+ refuses --remote-debugging-port on the default profile directory, so run a
# dedicated one seeded from the real profile (keeps cookies, logins, history, extensions).
: "${OPENCLAW_CHROME_PROFILE_DIR:=$DEFAULT_DEBUG_PROFILE}"

echo "Using: $CHROME_BIN"
echo "Killing existing Chrome debug instances..."
pkill -f -- "--remote-debugging-port=9222" 2>/dev/null || true
sleep 2

if [ ! -d "$OPENCLAW_CHROME_PROFILE_DIR/Default" ] && [ -d "$REAL_PROFILE/Default" ]; then
  echo "First run: copying the real Chrome profile into $OPENCLAW_CHROME_PROFILE_DIR ..."
  mkdir -p "$OPENCLAW_CHROME_PROFILE_DIR/Default"
  cp -R "$REAL_PROFILE/Default/." "$OPENCLAW_CHROME_PROFILE_DIR/Default/" 2>/dev/null || true
  cp -f "$REAL_PROFILE/Local State" "$OPENCLAW_CHROME_PROFILE_DIR/Local State" 2>/dev/null || true
  for junk in "Cache" "Code Cache" "GPUCache" "GrShaderCache" "ShaderCache" "DawnCache" "DawnGraphiteCache" "DawnWebGPUCache" "Service Worker" "component_crx_cache" "extensions_crx_cache" "optimization_guide_model_store" "blob_storage"; do
    rm -rf "$OPENCLAW_CHROME_PROFILE_DIR/Default/$junk"
  done
fi
mkdir -p "$OPENCLAW_CHROME_PROFILE_DIR"

echo "Starting Chrome (profile: $OPENCLAW_CHROME_PROFILE_DIR)..."
"$CHROME_BIN" \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="$OPENCLAW_CHROME_PROFILE_DIR" \
  --profile-directory=Default \
  --no-first-run \
  --no-default-browser-check &

sleep 4
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
  echo -e "\033[32mOK! Chrome is listening on port 9222.\033[0m"
else
  echo -e "\033[31mERROR: Port 9222 not responding. Quit every Chrome window and run this again.\033[0m"
  exit 1
fi
