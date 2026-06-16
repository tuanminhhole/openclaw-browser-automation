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
function patchDockerFiles(projectDir, logger) {
  const dockerDir = path.join(projectDir, 'docker', 'openclaw');

  // â”€â”€ 1. Patch Dockerfile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dockerfilePath = path.join(dockerDir, 'Dockerfile');
  if (existsSync(dockerfilePath)) {
    try {
      let dockerfile = readFileSync(dockerfilePath, 'utf8');
      const browserBlock = [
        '# Browser Automation: Playwright + Chromium (browser-automation plugin)',
        '# This layer is cached â€” Chromium is only downloaded on the first build.',
        'RUN apt-get update && apt-get install -y --no-install-recommends xvfb socat \\',
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
          writeFileSync(dockerfilePath, dockerfile, 'utf8');
          logger.info('[browser-automation] Patched Dockerfile with browser deps (Playwright + Chromium cached layer).');
        }
      } else {
        // Update existing block
        dockerfile = upsertShellManagedBlock(dockerfile, 'SMART_SEARCH_BROWSER', browserBlock);
        writeFileSync(dockerfilePath, dockerfile, 'utf8');
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
      const browserEntrypoint = [
        '# Browser Automation: auto-detect host Chrome or start local headless Chromium',
        'HOST_OPEN=$(node -e "',
        "  const net = require('net');",
        "  const client = net.createConnection({ port: 9222, host: 'host.docker.internal', timeout: 1000 }, () => {",
        "    console.log('OPEN');",
        '    client.end();',
        '  });',
        "  client.on('error', () => { console.log('CLOSED'); });",
        "  client.on('timeout', () => { console.log('CLOSED'); client.destroy(); });",
        '" 2>/dev/null || echo "CLOSED")',
        '',
        'if [ "$HOST_OPEN" = "OPEN" ]; then',
        '  echo "[browser-automation] Host Chrome debug port 9222 detected. Forwarding via socat..."',
        '  socat TCP-LISTEN:9222,fork,reuseaddr TCP:host.docker.internal:9222 &',
        'else',
        '  echo "[browser-automation] No host Chrome detected. Starting local headless Chromium via Xvfb..."',
        '  Xvfb :99 -screen 0 1280x720x24 > /dev/null 2>&1 &',
        '  export DISPLAY=:99',
        '  # Launch Chromium with remote debugging port for CDP connections',
        '  google-chrome --no-sandbox --disable-gpu --disable-dev-shm-usage \\',
        '    --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 \\',
        '    --headless --disable-background-networking \\',
        '    --user-data-dir=/tmp/chromium-data > /var/log/chromium-debug.log 2>&1 &',
        '  sleep 3',
        '  if curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1; then',
        '    echo "[browser-automation] Local headless Chromium started on port 9222."',
        '  else',
        '    echo "[browser-automation] WARNING: Chromium failed to start. Browser features may not work."',
        '  fi',
        'fi',
      ].join('\n');

      // Insert BEFORE the `openclaw gateway run` line
      if (!entrypoint.includes('OPENCLAW:SMART_SEARCH_BROWSER_RUNTIME:START')) {
        const gwIdx = entrypoint.indexOf('openclaw gateway run');
        if (gwIdx !== -1) {
          const before = entrypoint.substring(0, gwIdx);
          const after = entrypoint.substring(gwIdx);
          entrypoint = before + `# OPENCLAW:SMART_SEARCH_BROWSER_RUNTIME:START\n${browserEntrypoint}\n# OPENCLAW:SMART_SEARCH_BROWSER_RUNTIME:END\n\n` + after;
          writeFileSync(entrypointPath, entrypoint, 'utf8');
          logger.info('[browser-automation] Patched entrypoint.sh with browser runtime (socat/Xvfb/Chromium).');
        }
      } else {
        entrypoint = upsertShellManagedBlock(entrypoint, 'SMART_SEARCH_BROWSER_RUNTIME', browserEntrypoint);
        writeFileSync(entrypointPath, entrypoint, 'utf8');
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
          writeFileSync(composePath, compose, 'utf8');
          logger.info('[browser-automation] Added extra_hosts to docker-compose.yml for Chrome CDP access.');
        }
      }
    } catch (err) {
      logger.error(`[browser-automation] Failed to patch docker-compose.yml: ${err.message}`);
    }
  }
}

// â”€â”€ Browser config injection into openclaw.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function injectBrowserConfig(projectDir, logger) {
  const configPath = path.join(projectDir, '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return;

  try {
    const raw = readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    // Only inject if browser config is not already present
    if (!config.browser) {
      config.browser = {
        enabled: true,
        defaultProfile: 'host-chrome',
        profiles: {
          'host-chrome': {
            cdpUrl: 'http://127.0.0.1:9222',
            color: '#4285F4',
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      logger.info('[browser-automation] Injected browser config into openclaw.json.');
    }
  } catch (err) {
    logger.error(`[browser-automation] Failed to inject browser config: ${err.message}`);
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

    // Resolve project directory and workspace directories for all agents
    let projectDir = path.resolve(_openclawHome, '..');
    if (!existsSync(path.join(projectDir, 'docker')) && existsSync('/mnt/project/docker')) {
      projectDir = '/mnt/project';
    }

    // â”€â”€ Inject browser config into openclaw.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    injectBrowserConfig(projectDir, logger);

    // â”€â”€ Patch Docker files if project uses Docker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    patchDockerFiles(projectDir, logger);

    async function syncWorkspaceAssets() {
      try {
        if (!cfg.agents?.list || cfg.agents.list.length === 0) return;

        logger.info('[browser-automation] Syncing browser automation assets into plugin-skills/browser-automation...');

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

          const pluginSkillPath = path.join(workspacePath, 'plugin-skills', 'browser-automation');
          await fs.mkdir(pluginSkillPath, { recursive: true });

          // 1. Write browser controller into the plugin skill folder only.
          await fs.writeFile(path.join(pluginSkillPath, 'browser-tool.js'), browserToolContent, 'utf8');
          const legacySearchTool = ['search', 'tool.js'].join('-');
          await fs.rm(path.join(workspacePath, legacySearchTool), { force: true }).catch(() => {});
          await fs.rm(path.join(workspacePath, 'browser-tool.js'), { force: true }).catch(() => {});
          await fs.rm(path.join(workspacePath, 'BROWSER.md'), { force: true }).catch(() => {});
          
          // 2. Write one startup script for the selected/host OS to avoid duplicates.
          const pluginConfig = cfg.plugins?.entries?.[PLUGIN_ID]?.config || cfg.plugins?.entries?.['openclaw-browser-automation']?.config || {};
          const hostOs = pluginConfig.hostOs || process.env.OPENCLAW_BROWSER_HOST_OS || process.env.OPENCLAW_SETUP_OS || process.platform;
          const useBat = hostOs === 'win' || hostOs === 'windows' || hostOs === 'win32';
          const keepScript = useBat ? 'start-chrome-debug.bat' : 'start-chrome-debug.sh';
          const removeScript = useBat ? 'start-chrome-debug.sh' : 'start-chrome-debug.bat';
          await fs.writeFile(path.join(pluginSkillPath, keepScript), useBat ? batContent : shContent, 'utf8');
          await fs.rm(path.join(workspacePath, removeScript), { force: true }).catch(() => {});
          await fs.rm(path.join(workspacePath, keepScript), { force: true }).catch(() => {});
          await fs.rm(path.join(pluginSkillPath, removeScript), { force: true }).catch(() => {});
          if (!useBat) {
            try {
              await fs.chmod(path.join(pluginSkillPath, keepScript), 0o755);
            } catch(e) {}
          }

          // 3. Remove legacy prompt folders that told agents to use terminal-based search.
          for (const cDir of ['cl-stealth-search', 'openclaw-smart-search']) {
            await fs.rm(path.join(workspacePath, 'plugin-skills', cDir), { recursive: true, force: true }).catch(() => {});
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

          // 5. Generate browser instructions in the plugin skill folder.
          const browserMdPath = path.join(pluginSkillPath, 'BROWSER.md');
          const cleanBrowserMdContent = [
            '# Browser Automation',
            '',
            "This plugin skill owns browser automation only. For normal web search, use OpenClaw's built-in `web_search` capability.",
            '',
            'Run commands from this folder or pass the full path from the workspace root:',
            '',
            '- `cd plugin-skills/browser-automation && node browser-tool.js status`',
            '- `node plugin-skills/browser-automation/browser-tool.js status`',
            '',
            '## Chrome Debug Mode',
            '',
            'On a desktop machine, start real Chrome in debug mode before asking the bot to browse:',
            '',
            '- Windows: run `start-chrome-debug.bat`',
            '- macOS/Linux: run `./start-chrome-debug.sh`',
            '',
            'The tool will try real host Chrome first. If Chrome debug is not available, it falls back to local headless Chromium, which is suitable for VPS/server use.',
            '',
            '## Browser Commands',
            '',
            '- `node plugin-skills/browser-automation/browser-tool.js status`: check the active browser/tab',
            '- `node plugin-skills/browser-automation/browser-tool.js open <url>`: open a page',
            '- `node plugin-skills/browser-automation/browser-tool.js get_text [max_chars]`: read rendered page text',
            '- `node plugin-skills/browser-automation/browser-tool.js get_links [filter]`: list links',
            '- `node plugin-skills/browser-automation/browser-tool.js click "<selector>"`: click an element',
            '- `node plugin-skills/browser-automation/browser-tool.js fill "<selector>" "<text>"`: fill an input',
            '- `node plugin-skills/browser-automation/browser-tool.js scroll [px]`: scroll the page',
            '- `node plugin-skills/browser-automation/browser-tool.js screenshot [path]`: capture the viewport',
            '- `node plugin-skills/browser-automation/browser-tool.js tabs`: list tabs',
            '',
            'Do not use `search-tool.js`; this plugin does not provide search. Use `web_search` for search and this browser tool only when a rendered browser is needed.',
            '',
          ].join('\n');
          await fs.writeFile(browserMdPath, cleanBrowserMdContent, 'utf8');

          logger.info(`[browser-automation] Synchronized workspace assets for agent: ${a.id}`);
        }
      } catch (err) {
        logger.error(`[browser-automation] Failed to synchronize workspace assets: ${err.message}`);
      }
    }

    // Run sync asynchronously on startup
    syncWorkspaceAssets().catch((err) => {
      logger.error(`[browser-automation] Startup sync failed: ${err.message}`);
    });
  }
});

export default plugin;



