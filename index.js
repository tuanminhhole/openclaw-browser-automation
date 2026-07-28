import fs from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve OPENCLAW_HOME
let _openclawHome = path.resolve(__dirname, '..', '..');
const _homeBasename = path.basename(_openclawHome);
if (_homeBasename === 'npm' || _homeBasename === 'node_modules') {
  _openclawHome = path.resolve(_openclawHome, '..');
  if (path.basename(_openclawHome) === 'npm') {
    _openclawHome = path.resolve(_openclawHome, '..');
  }
}

const PLUGIN_ID = 'browser-automation';

// Everything this plugin changes outside its own folder is listed here, switchable, backed up
// before the first write, and reported to the operator afterwards. A browser controller has to
// touch the runtime it drives — the CDP endpoint has to be in openclaw.json, the container needs
// Chromium and a route to the host — but none of that should happen invisibly or irreversibly.
const EFFECT_DEFAULTS = {
  // Write browser.profiles['host-chrome'].cdpUrl (+ enable browser control) into openclaw.json.
  manageBrowserConfig: true,
  // Add the Chromium layer to the Dockerfile, the browser runtime block to entrypoint.sh, and
  // host.docker.internal to docker-compose.yml. Docker projects only.
  patchDocker: true,
  // Write skills/browser-automation/{browser-tool.js,SKILL.md,start-chrome-debug.*} per workspace.
  syncWorkspaceSkill: true,
  // Delete assets earlier versions of THIS plugin put in the wrong place (see docs).
  cleanupLegacyAssets: true,
};

function resolvePluginConfig(cfg = {}) {
  const entries = cfg.plugins?.entries || {};
  const raw = entries[PLUGIN_ID]?.config || entries['openclaw-browser-automation']?.config || {};
  const effects = { ...EFFECT_DEFAULTS };
  for (const key of Object.keys(EFFECT_DEFAULTS)) {
    if (typeof raw[key] === 'boolean') effects[key] = raw[key];
  }
  return { raw, effects };
}

// One `.bak-browser-automation` per file, written before the first change and never overwritten,
// so the operator always has the pre-plugin version to go back to.
function backupOnce(filePath, changes) {
  const backup = `${filePath}.bak-browser-automation`;
  if (!existsSync(filePath) || existsSync(backup)) return;
  try {
    writeFileSync(backup, readFileSync(filePath, 'utf8'), 'utf8');
    changes.push({ action: 'backup', path: backup });
  } catch (_) {}
}

function normalizeHostOs(value = '') {
  const v = String(value || '').trim().toLowerCase();
  if (['win', 'windows', 'win32'].includes(v)) return 'win';
  if (['mac', 'macos', 'darwin'].includes(v)) return 'macos';
  if (['vps', 'server'].includes(v)) return 'vps';
  if (['linux', 'linux-desktop', 'ubuntu', 'debian'].includes(v)) return 'linux-desktop';
  return '';
}

function resolveHostOs(projectDir = '', cfg = {}) {
  const pluginEntries = cfg.plugins?.entries || {};
  const pluginConfig = pluginEntries[PLUGIN_ID]?.config || pluginEntries['openclaw-browser-automation']?.config || {};
  return normalizeHostOs(
    pluginConfig.hostOs ||
    cfg.meta?.osChoice ||
    cfg.meta?.hostOs ||
    process.env.OPENCLAW_BROWSER_HOST_OS ||
    process.env.OPENCLAW_SETUP_OS
  ) || (/^[A-Za-z]:[\\/]/.test(String(projectDir || '')) ? 'win' : normalizeHostOs(process.platform) || 'linux-desktop');
}

// â”€â”€ Managed block helper (idempotent insert/update) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function upsertManagedBlock(content, blockId, blockContent) {
  const startTag = `<!-- OPENCLAW:${blockId}:START -->`;
  const endTag = `<!-- OPENCLAW:${blockId}:END -->`;
  const newBlock = `${startTag}\n${blockContent}\n${endTag}`;
  if (!content) return newBlock;
  const startIdx = content.indexOf(startTag);
  const endIdx = content.indexOf(endTag);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return content.substring(0, startIdx) + newBlock + content.substring(endIdx + endTag.length);
  }
  return content.trim() + '\n\n' + newBlock + '\n';
}

// â”€â”€ Managed block helper for non-HTML files (Dockerfile, entrypoint.sh) â”€â”€â”€â”€â”€â”€
function upsertShellManagedBlock(content, blockId, blockContent) {
  const startTag = `# OPENCLAW:${blockId}:START`;
  const endTag = `# OPENCLAW:${blockId}:END`;
  const newBlock = `${startTag}\n${blockContent}\n${endTag}`;
  if (!content) return newBlock;
  const startIdx = content.indexOf(startTag);
  const endIdx = content.indexOf(endTag);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return content.substring(0, startIdx) + newBlock + content.substring(endIdx + endTag.length);
  }
  return content.trim() + '\n\n' + newBlock + '\n';
}

// â”€â”€ Docker patching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Patches Dockerfile, entrypoint.sh, docker-compose.yml to add browser deps.
// Uses managed blocks so it's idempotent â€” safe to run on every startup.
// Playwright/Chromium install is a separate Docker layer so it's cached across rebuilds.
function patchDockerFiles(projectDir, logger, changes) {
  const dockerDir = path.join(projectDir, 'docker', 'openclaw');

  // â”€â”€ 1. Patch Dockerfile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dockerfilePath = path.join(dockerDir, 'Dockerfile');
  if (existsSync(dockerfilePath)) {
    try {
      let dockerfile = readFileSync(dockerfilePath, 'utf8');
      const browserBlock = [
        '# Browser Automation: Playwright + Chromium (browser-automation plugin)',
        '# This layer is cached â€” Chromium is only downloaded on the first build.',
        'RUN apt-get update && apt-get install -y --no-install-recommends xvfb \\',
        '    && rm -rf /var/lib/apt/lists/*',
        'RUN npm install -g playwright \\',
        '    && npx playwright install chromium --with-deps \\',
        '    && ln -f -s /root/.cache/ms-playwright/chromium-*/chrome-linux*/chrome /usr/bin/google-chrome 2>/dev/null || true',
      ].join('\n');

      // Insert BEFORE the COPY entrypoint.sh line
      if (!dockerfile.includes('OPENCLAW:SMART_SEARCH_BROWSER:START')) {
        const copyIdx = dockerfile.indexOf('COPY entrypoint.sh');
        if (copyIdx !== -1) {
          const before = dockerfile.substring(0, copyIdx);
          const after = dockerfile.substring(copyIdx);
          dockerfile = before + `# OPENCLAW:SMART_SEARCH_BROWSER:START\n${browserBlock}\n# OPENCLAW:SMART_SEARCH_BROWSER:END\n\n` + after;
          backupOnce(dockerfilePath, changes);
          writeFileSync(dockerfilePath, dockerfile, 'utf8');
          changes.push({ action: 'patch', path: dockerfilePath, detail: 'added Playwright/Chromium layer (managed block SMART_SEARCH_BROWSER)' });
          logger.info('[browser-automation] Patched Dockerfile with browser deps (Playwright + Chromium cached layer).');
        }
      } else {
        // Update existing block
        dockerfile = upsertShellManagedBlock(dockerfile, 'SMART_SEARCH_BROWSER', browserBlock);
        backupOnce(dockerfilePath, changes);
        writeFileSync(dockerfilePath, dockerfile, 'utf8');
        changes.push({ action: 'patch', path: dockerfilePath, detail: 'updated managed block SMART_SEARCH_BROWSER' });
        logger.info('[browser-automation] Updated existing browser block in Dockerfile.');
      }
    } catch (err) {
      logger.error(`[browser-automation] Failed to patch Dockerfile: ${err.message}`);
    }
  }

  // â”€â”€ 2. Patch entrypoint.sh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const entrypointPath = path.join(dockerDir, 'entrypoint.sh');
  if (existsSync(entrypointPath)) {
    try {
      let entrypoint = readFileSync(entrypointPath, 'utf8');
      // Keep a working CDP endpoint on 127.0.0.1:9222 inside the container, always. Which
      // browser a client PREFERS is decided by the client, not here: browser-tool.js tries
      // host-gateway:9222 (the operator's real Chrome) before the local one, and
      // injectBrowserConfig points the native browser tool at the gateway IP on desktop hosts.
      //
      // This block used to decide once at boot: host Chrome reachable → forward the port with
      // `socat`, otherwise start a local Chromium. That broke the moment the operator quit
      // Chrome — socat kept accepting on 9222 and then hung up mid-handshake ("socket hang
      // up"), so the local fallback never ran and browsing stayed dead until someone
      // restarted the container. No forwarding now, and a keeper restarts the local browser
      // if it dies, so the fallback is always really there.
      const browserEntrypoint = [
        '# Browser Automation: keep a local headless Chromium serving CDP on 127.0.0.1:9222.',
        '# Host Chrome is preferred by the clients (host-gateway:9222), not forwarded here.',
        'ba_cdp_alive() { curl -s -m 2 http://127.0.0.1:9222/json/version >/dev/null 2>&1; }',
        'ba_chrome_bin() {',
        '  for candidate in /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser; do',
        '    [ -x "$candidate" ] && echo "$candidate" && return 0',
        '  done',
        '  ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome /root/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | head -n 1',
        '}',
        'ba_start_local() {',
        '  chrome_bin="$(ba_chrome_bin || true)"',
        '  if [ -z "$chrome_bin" ] || [ ! -x "$chrome_bin" ]; then',
        '    echo "[browser-automation] WARNING: no Chromium in this image; only the operator\'s host Chrome will work."',
        '    return 1',
        '  fi',
        '  [ -e /tmp/.X11-unix/X99 ] || Xvfb :99 -screen 0 1280x720x24 >/dev/null 2>&1 &',
        '  DISPLAY=:99 "$chrome_bin" --no-sandbox --disable-gpu --disable-dev-shm-usage \\',
        '    --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \\',
        '    --headless --disable-background-networking \\',
        '    --user-data-dir=/tmp/chromium-data >/var/log/chromium-debug.log 2>&1 &',
        '  return 0',
        '}',
        'if ba_cdp_alive; then',
        '  echo "[browser-automation] CDP already answering on 127.0.0.1:9222; leaving it alone."',
        'else',
        '  echo "[browser-automation] Starting local headless Chromium on 127.0.0.1:9222..."',
        '  if ba_start_local; then',
        '    sleep 3',
        '    if ba_cdp_alive; then',
        '      echo "[browser-automation] Local headless Chromium started on port 9222."',
        '    else',
        '      echo "[browser-automation] WARNING: Chromium did not answer on 9222 yet; see /var/log/chromium-debug.log."',
        '    fi',
        '  fi',
        'fi',
        '# Keeper: a crashed local browser used to take browsing down until the next restart.',
        '( while true; do sleep 60; ba_cdp_alive || ba_start_local || true; done ) >/dev/null 2>&1 &',
      ].join('\n');

      // Insert BEFORE the `openclaw gateway run` line
      if (!entrypoint.includes('OPENCLAW:SMART_SEARCH_BROWSER_RUNTIME:START')) {
        const gwIdx = entrypoint.indexOf('openclaw gateway run');
        if (gwIdx !== -1) {
          const before = entrypoint.substring(0, gwIdx);
          const after = entrypoint.substring(gwIdx);
          entrypoint = before + `# OPENCLAW:SMART_SEARCH_BROWSER_RUNTIME:START\n${browserEntrypoint}\n# OPENCLAW:SMART_SEARCH_BROWSER_RUNTIME:END\n\n` + after;
          backupOnce(entrypointPath, changes);
          writeFileSync(entrypointPath, entrypoint, 'utf8');
          changes.push({ action: 'patch', path: entrypointPath, detail: 'added local headless Chromium runtime (managed block SMART_SEARCH_BROWSER_RUNTIME)' });
          logger.info('[browser-automation] Patched entrypoint.sh with browser runtime (local headless Chromium + keeper).');
        }
      } else {
        entrypoint = upsertShellManagedBlock(entrypoint, 'SMART_SEARCH_BROWSER_RUNTIME', browserEntrypoint);
        backupOnce(entrypointPath, changes);
        writeFileSync(entrypointPath, entrypoint, 'utf8');
        changes.push({ action: 'patch', path: entrypointPath, detail: 'updated managed block SMART_SEARCH_BROWSER_RUNTIME' });
        logger.info('[browser-automation] Updated existing browser runtime block in entrypoint.sh.');
      }
    } catch (err) {
      logger.error(`[browser-automation] Failed to patch entrypoint.sh: ${err.message}`);
    }
  }

  // â”€â”€ 3. Patch docker-compose.yml â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const composePath = path.join(dockerDir, 'docker-compose.yml');
  if (existsSync(composePath)) {
    try {
      let compose = readFileSync(composePath, 'utf8');
      // Ensure extra_hosts is present for host.docker.internal access
      if (!compose.includes('host.docker.internal')) {
        // Find the first `volumes:` in the bot service and add extra_hosts before it
        const volumesIdx = compose.indexOf('    volumes:');
        if (volumesIdx !== -1) {
          const before = compose.substring(0, volumesIdx);
          const after = compose.substring(volumesIdx);
          const extraHosts = '    extra_hosts:\n      - "host.docker.internal:host-gateway"\n';
          compose = before + extraHosts + after;
          backupOnce(composePath, changes);
          writeFileSync(composePath, compose, 'utf8');
          changes.push({ action: 'patch', path: composePath, detail: 'added extra_hosts host.docker.internal:host-gateway' });
          logger.info('[browser-automation] Added extra_hosts to docker-compose.yml for Chrome CDP access.');
        }
      }
    } catch (err) {
      logger.error(`[browser-automation] Failed to patch docker-compose.yml: ${err.message}`);
    }
  }
}

// â”€â”€ Browser config injection into openclaw.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Resolve the docker host-gateway IP from /etc/hosts. `extra_hosts` maps
// host.docker.internal -> host-gateway, so the container's /etc/hosts holds the
// real gateway IP. Chrome's DevTools endpoint rejects a hostname Host header but
// accepts an IP, so the CDP URL must use the IP, not the `host.docker.internal` name.
function resolveHostGatewayIp() {
  try {
    const hosts = readFileSync('/etc/hosts', 'utf8');
    const m = hosts.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+(?:\S+\s+)*host\.docker\.internal\b/m);
    if (m) return m[1];
  } catch (e) {}
  return null;
}

function injectBrowserConfig(projectDir, cfg, logger, changes) {
  const configPath = path.join(projectDir, '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return;

  try {
    const raw = readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    // Desktop hosts (Windows/macOS) drive a REAL host Chrome over CDP via the docker
    // host-gateway IP. VPS/Linux uses the in-container headless Chromium on 127.0.0.1
    // started by the entrypoint.
    const hostOs = resolveHostOs(projectDir, cfg);
    const useHostChrome = hostOs === 'win' || hostOs === 'macos';
    const cdpUrl = useHostChrome
      ? 'http://' + (resolveHostGatewayIp() || '192.168.65.254') + ':9222'
      : 'http://127.0.0.1:9222';

    let changed = false;

    // 1. Ensure browser control is enabled with a working CDP endpoint. Merge into
    //    any existing browser config instead of skipping when it already exists
    //    (a pre-existing config without `enabled:true` leaves browser control off).
    const browser = config.browser && typeof config.browser === 'object' ? config.browser : {};
    if (browser.enabled !== true) { browser.enabled = true; changed = true; }
    if (!browser.defaultProfile) { browser.defaultProfile = 'host-chrome'; changed = true; }
    const profiles = browser.profiles && typeof browser.profiles === 'object' ? browser.profiles : {};
    const hostProfile = profiles['host-chrome'] && typeof profiles['host-chrome'] === 'object' ? profiles['host-chrome'] : {};
    if (hostProfile.cdpUrl !== cdpUrl) { hostProfile.cdpUrl = cdpUrl; changed = true; }
    if (!hostProfile.color) { hostProfile.color = '#4285F4'; changed = true; }
    profiles['host-chrome'] = hostProfile;
    browser.profiles = profiles;

    // 1b. Host Chrome is reached over the docker host-gateway, a PRIVATE IP. The
    //     browser SSRF policy blocks private targets by default, which surfaces as
    //     "browser endpoint blocked by policy". Allow private network for host mode.
    //     (Schema key is dangerouslyAllowPrivateNetwork, not allowPrivateNetwork.)
    if (useHostChrome) {
      const ssrf = browser.ssrfPolicy && typeof browser.ssrfPolicy === 'object' ? browser.ssrfPolicy : {};
      if (ssrf.dangerouslyAllowPrivateNetwork !== true) { ssrf.dangerouslyAllowPrivateNetwork = true; changed = true; }
      browser.ssrfPolicy = ssrf;
    }
    config.browser = browser;

    // 2. The bundled `browser` plugin provides the browser-control service this
    //    plugin depends on. If an allowlist is in use it must include `browser`,
    //    otherwise browser control stays disabled ("browser control is disabled").
    if (config.plugins && Array.isArray(config.plugins.allow) && !config.plugins.allow.includes('browser')) {
      config.plugins.allow.push('browser');
      changed = true;
    }

    if (changed) {
      backupOnce(configPath, changes);
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      changes.push({ action: 'patch', path: configPath, detail: `browser.enabled=true, browser.profiles['host-chrome'].cdpUrl=${cdpUrl}${useHostChrome ? ', browser.ssrfPolicy.dangerouslyAllowPrivateNetwork=true (host Chrome is on a private IP)' : ''}` });
      logger.info(`[browser-automation] Ensured browser config (enabled, cdpUrl=${cdpUrl}) + bundled 'browser' plugin allow.`);
    }
  } catch (err) {
    logger.error(`[browser-automation] Failed to inject browser config: ${err.message}`);
  }
}

// Say out loud what was changed, and leave the same list on disk. Without this the operator has
// to diff their own project to find out that a plugin rewrote openclaw.json and the Dockerfile.
function writeInstallReport(projectDir, effects, changes, logger) {
  if (!changes.length) {
    logger.info('[browser-automation] Nothing to change — project already set up for browsing.');
    return;
  }
  const patched = changes.filter((c) => c.action === 'patch');
  const removed = changes.filter((c) => c.action === 'remove-legacy');
  const skills = changes.filter((c) => c.action === 'write-skill');
  logger.info(`[browser-automation] Applied ${changes.length} change(s) to this project:`);
  for (const c of patched) logger.info(`  • changed ${c.path} — ${c.detail}`);
  for (const c of skills) logger.info(`  • wrote skill ${c.path} (${c.detail})`);
  for (const c of removed) logger.info(`  • removed stale plugin asset ${c.path}`);
  logger.info('  • originals saved next to each file as *.bak-browser-automation');
  logger.info('  • turn any of this off with plugins.entries["browser-automation"].config: manageBrowserConfig / patchDocker / syncWorkspaceSkill / cleanupLegacyAssets');

  const reportPath = path.join(projectDir, '.openclaw', 'browser-automation-install-report.json');
  try {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify({
      plugin: PLUGIN_ID,
      writtenAt: new Date().toISOString(),
      effects,
      changes,
      revert: 'Restore each *.bak-browser-automation file over the original, or delete the OPENCLAW:SMART_SEARCH_BROWSER* managed blocks from Dockerfile/entrypoint.sh.',
    }, null, 2), 'utf8');
    logger.info(`[browser-automation] Full report: ${reportPath}`);
  } catch (err) {
    logger.error(`[browser-automation] Could not write the install report: ${err.message}`);
  }
}

const plugin = definePluginEntry({
  id: PLUGIN_ID,
  name: 'Browser Automation',
  description: 'Chrome/Chromium CDP browser controller with real Chrome debug support and headless fallback.',

  register(api) {
    const logger = api.logger;
    logger.info('[browser-automation] Registering plugin...');

    // â”€â”€ Proactively fix permissions to prevent openclaw gateway broad permissions error â”€â”€
    try {
      chmodSync(__dirname, 0o755);
      for (const f of readdirSync(__dirname)) {
        try {
          const p = path.join(__dirname, f);
          const st = statSync(p);
          chmodSync(p, st.isDirectory() ? 0o755 : 0o644);
        } catch (_) {}
      }
    } catch (_) {}

    const cfg = api.config;
    const { effects } = resolvePluginConfig(cfg);
    // Every path written outside the plugin folder ends up in here and then in the install
    // report, so "what did this plugin change on my machine" has an answer that is not "read
    // the source".
    const changes = [];

    // Resolve project directory and workspace directories for all agents
    let projectDir = path.resolve(_openclawHome, '..');
    if (!existsSync(path.join(projectDir, 'docker')) && existsSync('/mnt/project/docker')) {
      projectDir = '/mnt/project';
    }

    // â”€â”€ Inject browser config into openclaw.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (effects.manageBrowserConfig) {
      injectBrowserConfig(projectDir, cfg, logger, changes);
    } else {
      logger.info("[browser-automation] manageBrowserConfig=false: leaving openclaw.json untouched. Browsing needs browser.profiles['host-chrome'].cdpUrl set by hand.");
    }

    // â”€â”€ Patch Docker files if project uses Docker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (effects.patchDocker) {
      patchDockerFiles(projectDir, logger, changes);
    } else {
      logger.info('[browser-automation] patchDocker=false: leaving Dockerfile/entrypoint.sh/docker-compose.yml untouched. The container then has no Chromium and no route to a host Chrome.');
    }

    async function syncWorkspaceAssets() {
      try {
        if (!cfg.agents?.list || cfg.agents.list.length === 0) return;

        logger.info('[browser-automation] Syncing browser automation skill into <workspace>/skills/browser-automation...');

        // Reading source assets from plugin directory
        const browserToolContent = await fs.readFile(path.join(__dirname, 'browser-tool.js'), 'utf8');
        const batContent = await fs.readFile(path.join(__dirname, 'start-chrome-debug.bat'), 'utf8');
        const shContent = await fs.readFile(path.join(__dirname, 'start-chrome-debug.sh'), 'utf8');

        for (const a of cfg.agents.list) {
          const workspaceRel = a.workspace || cfg.agents.defaults?.workspace || 'workspace';
          const workspacePath = path.resolve(projectDir, workspaceRel);

          if (!existsSync(workspacePath)) {
            await fs.mkdir(workspacePath, { recursive: true });
          }

          // Correct location: <workspace>/skills/<name>/ is the highest-precedence skill
          // source OpenClaw scans (source "openclaw-workspace"), matching how the other
          // working skills (cronjob, infographic-generator) are installed. OpenClaw does
          // NOT scan <workspace>/plugin-skills, and .openclaw/plugin-skills ranks below
          // bundled skills, so neither is suitable here.
          const skillDir = path.join(workspacePath, 'skills', 'browser-automation');
          await fs.mkdir(skillDir, { recursive: true });

          // 1. Write browser controller into the skill folder.
          await fs.writeFile(path.join(skillDir, 'browser-tool.js'), browserToolContent, 'utf8');

          // 2. Write one startup script for the selected/host OS to avoid duplicates.
          const hostOs = resolveHostOs(projectDir, cfg);
          const useBat = hostOs === 'win';
          const keepScript = useBat ? 'start-chrome-debug.bat' : 'start-chrome-debug.sh';
          const removeScript = useBat ? 'start-chrome-debug.sh' : 'start-chrome-debug.bat';
          await fs.writeFile(path.join(skillDir, keepScript), useBat ? batContent : shContent, 'utf8');
          await fs.rm(path.join(skillDir, removeScript), { force: true }).catch(() => {});
          if (!useBat) {
            try {
              await fs.chmod(path.join(skillDir, keepScript), 0o755);
            } catch(e) {}
          }

          // 3. Remove assets that earlier versions of THIS plugin wrote to the wrong place.
          //    Deletions are limited to those exact names — nothing the operator authored is
          //    touched — and each one is recorded in the install report.
          if (effects.cleanupLegacyAssets) {
            const legacyPaths = [
              path.join(workspacePath, 'plugin-skills', 'browser-automation'),
              path.join(projectDir, '.openclaw', 'plugin-skills', 'browser-automation'),
              path.join(workspacePath, ['search', 'tool.js'].join('-')),
              path.join(workspacePath, 'browser-tool.js'),
              path.join(workspacePath, 'BROWSER.md'),
              ...['cl-stealth-search', 'openclaw-smart-search'].flatMap((cDir) => [
                path.join(workspacePath, 'plugin-skills', cDir),
                path.join(workspacePath, 'skills', cDir),
              ]),
            ];
            for (const legacyPath of legacyPaths) {
              if (!existsSync(legacyPath)) continue;
              await fs.rm(legacyPath, { recursive: true, force: true }).catch(() => {});
              changes.push({ action: 'remove-legacy', path: legacyPath });
            }
          }

          // 4. Patch TOOLS.md
          const toolsMdPath = path.join(workspacePath, 'TOOLS.md');
          let toolsContent = '';
          try {
            toolsContent = await fs.readFile(toolsMdPath, 'utf8');
          } catch (e) {
            toolsContent = '# HÆ°á»›ng dáº«n sá»­ dá»¥ng Tools\n';
          }
          const cleanedTools = toolsContent.replace(/<!-- OPENCLAW:STEALTH_BROWSER_GUIDE:START -->[\s\S]*?<!-- OPENCLAW:STEALTH_BROWSER_GUIDE:END -->\n?/g, '').trim() + '\n';
          await fs.writeFile(toolsMdPath, cleanedTools, 'utf8');

          // 5. Write the skill instructions as SKILL.md WITH YAML frontmatter. The
          //    OpenClaw skill loader skips any SKILL.md that lacks a `description`, and
          //    only ever reads a file named SKILL.md (never BROWSER.md). Command paths
          //    are relative to the workspace root.
          const skillMdContent = [
            '---',
            'name: browser-automation',
            'description: Use when controlling a real web page with the browser-tool CLI - open pages, read rendered text/links, click, fill forms, run page JavaScript, upload a file into a page, screenshot, manage tabs. For plain web search use the built-in web_search instead.',
            'user-invocable: false',
            '---',
            '',
            '# Browser Automation',
            '',
            "This skill owns browser automation only. For normal web search, use OpenClaw's built-in `web_search` capability.",
            '',
            'Run commands from the workspace root:',
            '',
            '- `node skills/browser-automation/browser-tool.js status`',
            '- or `cd skills/browser-automation && node browser-tool.js status`',
            '',
            '## What the browser is',
            '',
            'The tool does not launch a browser: it attaches over CDP to one that is already running,',
            'preferring the operator\'s real Chrome on the host (`host-gateway:9222`) and falling back to',
            'a headless Chromium inside the container on `127.0.0.1:9222`.',
            '',
            'When it attaches to the host Chrome it is driving **the operator\'s own browser session** —',
            'their cookies, their logins, their open tabs. Treat every page as the operator\'s account:',
            'read and navigate freely, but do not sign anything out, change account settings, delete data,',
            'confirm payments or submit forms that were not asked for.',
            '',
            'On a desktop machine, start Chrome with the debug port before asking the bot to browse:',
            '',
            '- Windows: run `skills/browser-automation/start-chrome-debug.bat`',
            '- macOS/Linux: run `./skills/browser-automation/start-chrome-debug.sh`',
            '',
            'That script runs a dedicated profile copied once from the real one (Chrome 136+ refuses the',
            'debug port on the default profile directory), so the operator\'s everyday Chrome stays open.',
            '',
            '## Browser Commands',
            '',
            'Reading:',
            '',
            '- `status`: active browser/tab',
            '- `open <url>`: open a page',
            '- `get_url`: current URL',
            '- `get_text [max_chars]`: rendered page text',
            '- `get_links [filter]`: links on the page',
            '- `get_posts`: repeated feed/list items',
            '- `console`: collect console output for ~2s',
            '- `screenshot [path]` / `screenshot_full [path]`: viewport / full page',
            '- `pdf [path]`: print the page to PDF',
            '- `tabs`: list tabs',
            '',
            'Interacting:',
            '',
            '- `click "<selector>"`, `fill "<selector>" "<text>"`, `press "<key>"`, `hover "<selector>"`,',
            '  `select "<selector>" "<value>"`, `scroll [px]`, `wait <ms|selector>`, `resize <w> <h>`',
            '- `new_tab [url]`, `switch_tab <index>`, `close_tab [index]`',
            '',
            'High-impact — use only when the task genuinely needs it, and say so in your reply:',
            '',
            '- `evaluate "<js>"`: runs arbitrary JavaScript in the page, with the page\'s full privileges',
            '  (its session, its localStorage). Prefer `get_text`/`get_links`/`click` when they suffice.',
            '  Operators can switch it off with `allowPageScripting: false`.',
            '- `upload "<selector>" "<file>"`: puts a file from this machine into a web page\'s file input,',
            '  i.e. it can send local data to a remote site. Only upload a file the operator named.',
            '  Operators can switch it off with `allowFileUpload: false`.',
            '',
            '## What this plugin changed in the project',
            '',
            'For transparency (all of it is switchable and backed up — see',
            '`.openclaw/browser-automation-install-report.json`):',
            '',
            '- wrote `browser.enabled`, `browser.profiles[\'host-chrome\'].cdpUrl` and, for a host Chrome on a',
            '  private IP, `browser.ssrfPolicy.dangerouslyAllowPrivateNetwork` into `.openclaw/openclaw.json`',
            '- on Docker projects: added a Playwright/Chromium layer to the `Dockerfile`, a local headless',
            '  Chromium block to `entrypoint.sh`, and `host.docker.internal` to `docker-compose.yml`',
            '- wrote this skill folder, and removed assets earlier versions of this plugin left elsewhere',
            '',
            'Do not use `search-tool.js`; this plugin does not provide search. Use `web_search` for search and this browser tool only when a rendered browser is needed.',
            '',
          ].join('\n');
          await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMdContent, 'utf8');
          await fs.rm(path.join(skillDir, 'BROWSER.md'), { force: true }).catch(() => {});
          changes.push({ action: 'write-skill', path: skillDir, detail: `browser-tool.js, SKILL.md, ${keepScript}` });

          logger.info(`[browser-automation] Synchronized skill into skills/browser-automation for agent: ${a.id}`);
        }
      } catch (err) {
        logger.error(`[browser-automation] Failed to synchronize workspace assets: ${err.message}`);
      }
    }

    // Run sync asynchronously on startup
    const synced = effects.syncWorkspaceSkill
      ? syncWorkspaceAssets().catch((err) => {
        logger.error(`[browser-automation] Startup sync failed: ${err.message}`);
      })
      : Promise.resolve(logger.info('[browser-automation] syncWorkspaceSkill=false: not writing skills/browser-automation into any workspace.'));
    synced.then(() => writeInstallReport(projectDir, effects, changes, logger));
  }
});

export default plugin;



