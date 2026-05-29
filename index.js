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

// ── Managed block helper (idempotent insert/update) ──────────────────────────
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

// ── Managed block helper for non-HTML files (Dockerfile, entrypoint.sh) ──────
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

// ── Docker patching ──────────────────────────────────────────────────────────
// Patches Dockerfile, entrypoint.sh, docker-compose.yml to add browser deps.
// Uses managed blocks so it's idempotent — safe to run on every startup.
// Playwright/Chromium install is a separate Docker layer so it's cached across rebuilds.
function patchDockerFiles(projectDir, logger) {
  const dockerDir = path.join(projectDir, 'docker', 'openclaw');

  // ── 1. Patch Dockerfile ──────────────────────────────────────────────────
  const dockerfilePath = path.join(dockerDir, 'Dockerfile');
  if (existsSync(dockerfilePath)) {
    try {
      let dockerfile = readFileSync(dockerfilePath, 'utf8');
      const browserBlock = [
        '# Browser Automation: Playwright + Chromium (openclaw-smart-search plugin)',
        '# This layer is cached — Chromium is only downloaded on the first build.',
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
          logger.info('[openclaw-smart-search] Patched Dockerfile with browser deps (Playwright + Chromium cached layer).');
        }
      } else {
        // Update existing block
        dockerfile = upsertShellManagedBlock(dockerfile, 'SMART_SEARCH_BROWSER', browserBlock);
        writeFileSync(dockerfilePath, dockerfile, 'utf8');
        logger.info('[openclaw-smart-search] Updated existing browser block in Dockerfile.');
      }
    } catch (err) {
      logger.error(`[openclaw-smart-search] Failed to patch Dockerfile: ${err.message}`);
    }
  }

  // ── 2. Patch entrypoint.sh ─────────────────────────────────────────────────
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
        '  echo "[openclaw-smart-search] Host Chrome debug port 9222 detected. Forwarding via socat..."',
        '  socat TCP-LISTEN:9222,fork,reuseaddr TCP:host.docker.internal:9222 &',
        'else',
        '  echo "[openclaw-smart-search] No host Chrome detected. Starting local headless Chromium via Xvfb..."',
        '  Xvfb :99 -screen 0 1280x720x24 > /dev/null 2>&1 &',
        '  export DISPLAY=:99',
        '  # Launch Chromium with remote debugging port for CDP connections',
        '  google-chrome --no-sandbox --disable-gpu --disable-dev-shm-usage \\',
        '    --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 \\',
        '    --headless --disable-background-networking \\',
        '    --user-data-dir=/tmp/chromium-data > /var/log/chromium-debug.log 2>&1 &',
        '  sleep 3',
        '  if curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1; then',
        '    echo "[openclaw-smart-search] Local headless Chromium started on port 9222."',
        '  else',
        '    echo "[openclaw-smart-search] WARNING: Chromium failed to start. Browser features may not work."',
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
          logger.info('[openclaw-smart-search] Patched entrypoint.sh with browser runtime (socat/Xvfb/Chromium).');
        }
      } else {
        entrypoint = upsertShellManagedBlock(entrypoint, 'SMART_SEARCH_BROWSER_RUNTIME', browserEntrypoint);
        writeFileSync(entrypointPath, entrypoint, 'utf8');
        logger.info('[openclaw-smart-search] Updated existing browser runtime block in entrypoint.sh.');
      }
    } catch (err) {
      logger.error(`[openclaw-smart-search] Failed to patch entrypoint.sh: ${err.message}`);
    }
  }

  // ── 3. Patch docker-compose.yml ────────────────────────────────────────────
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
          logger.info('[openclaw-smart-search] Added extra_hosts to docker-compose.yml for Chrome CDP access.');
        }
      }
    } catch (err) {
      logger.error(`[openclaw-smart-search] Failed to patch docker-compose.yml: ${err.message}`);
    }
  }
}

// ── Browser config injection into openclaw.json ──────────────────────────────
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
      logger.info('[openclaw-smart-search] Injected browser config into openclaw.json.');
    }
  } catch (err) {
    logger.error(`[openclaw-smart-search] Failed to inject browser config: ${err.message}`);
  }
}

const plugin = definePluginEntry({
  id: PLUGIN_ID,
  name: 'Smart Search & Browser Automation',
  description: 'Zero-token, Cloudflare-bypassing Stealth Search and dynamic Browser CDP controller plugin.',

  register(api) {
    const logger = api.logger;
    logger.info('[openclaw-smart-search] Registering plugin...');

    // ── Proactively fix permissions to prevent openclaw gateway broad permissions error ──
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
    const projectDir = path.resolve(_openclawHome, '..');

    // ── Inject browser config into openclaw.json ──────────────────────────
    injectBrowserConfig(projectDir, logger);

    // ── Patch Docker files if project uses Docker ─────────────────────────
    patchDockerFiles(projectDir, logger);

    async function syncWorkspaceAssets() {
      try {
        if (!cfg.agents?.list || cfg.agents.list.length === 0) return;

        logger.info('[openclaw-smart-search] Syncing stealth search & browser assets into workspaces...');

        // Reading source assets from plugin directory
        const searchToolContent = await fs.readFile(path.join(__dirname, 'search-tool.js'), 'utf8');
        const browserToolContent = await fs.readFile(path.join(__dirname, 'browser-tool.js'), 'utf8');
        const batContent = await fs.readFile(path.join(__dirname, 'start-chrome-debug.bat'), 'utf8');
        const shContent = await fs.readFile(path.join(__dirname, 'start-chrome-debug.sh'), 'utf8');
        const skillContent = await fs.readFile(path.join(__dirname, 'SKILL.md'), 'utf8');

        for (const a of cfg.agents.list) {
          const workspaceRel = a.workspace || cfg.agents.defaults?.workspace || 'workspace';
          const workspacePath = path.resolve(projectDir, workspaceRel);

          if (!existsSync(workspacePath)) {
            await fs.mkdir(workspacePath, { recursive: true });
          }

          // 1. Write tool files
          await fs.writeFile(path.join(workspacePath, 'search-tool.js'), searchToolContent, 'utf8');
          await fs.writeFile(path.join(workspacePath, 'browser-tool.js'), browserToolContent, 'utf8');
          
          // 2. Write startup scripts
          await fs.writeFile(path.join(workspacePath, 'start-chrome-debug.bat'), batContent, 'utf8');
          await fs.writeFile(path.join(workspacePath, 'start-chrome-debug.sh'), shContent, 'utf8');
          try {
            await fs.chmod(path.join(workspacePath, 'start-chrome-debug.sh'), 0o755);
          } catch(e) {}

          // 3. Write SKILL.md under skills catalog (both cl-stealth-search and openclaw-smart-search dirs for maximum compatibility)
          const compatDirs = ['cl-stealth-search', 'openclaw-smart-search'];
          for (const cDir of compatDirs) {
            const skillDir = path.join(workspacePath, 'plugin-skills', cDir);
            if (!existsSync(skillDir)) {
              await fs.mkdir(skillDir, { recursive: true });
            }
            await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent, 'utf8');
          }

          // 4. Patch TOOLS.md
          const toolsMdPath = path.join(workspacePath, 'TOOLS.md');
          let toolsContent = '';
          try {
            toolsContent = await fs.readFile(toolsMdPath, 'utf8');
          } catch (e) {
            toolsContent = '# Hướng dẫn sử dụng Tools\n';
          }

          const guideText = `## 🌐 Smart Search & Browser Automation
- **Tìm kiếm Internet:** Mỗi khi cần tìm kiếm Internet/Web, tra cứu giá vàng, thời tiết, tỷ giá ngoại tệ hay tin tức mới, bạn BẮT BUỘC phải gọi công cụ \`exec\` để chạy lệnh terminal: \`node search-tool.js "<từ khóa>" 5\`! Lệnh này cực kỳ nhanh, tàng hình và miễn phí.
- **Vượt Cloudflare:** TUYỆT ĐỐI KHÔNG dùng tool \`browser-tool.js\` để truy cập trực tiếp các trang nguồn như \`sjc.com.vn\` vì chúng luôn chặn Cloudflare hoàn toàn. Hãy dùng \`search-tool.js\` để lấy các bài báo tổng hợp tin tức từ các trang tin tức trung gian không bao giờ bị chặn (VnExpress, 24h, VietnamNet).
- **Trình duyệt tự động:** Xem chi tiết hướng dẫn các lệnh mở trang, cuộn trang, click, chụp ảnh màn hình tại tệp hướng dẫn **BROWSER.md** hoặc file skill **SKILL.md** của bạn. Điều khiển trình duyệt qua lệnh terminal: \`node browser-tool.js <action> [params]\`.
- **Chế độ xem trực quan (Chrome thật):** Chạy file \`start-chrome-debug.bat\` (Windows) hoặc \`start-chrome-debug.sh\` (Mac/Linux) trên máy tính trước → bot sẽ tự động kết nối điều khiển Chrome thật trên màn hình. Nếu không chạy file này, bot sẽ dùng Chromium ẩn (headless).
- **Chế độ ẩn (headless):** Mặc định bot dùng Chromium ẩn, hoạt động hoàn toàn tự động không cần mở cửa sổ trình duyệt — phù hợp cho server/VPS.`;

          const updatedTools = upsertManagedBlock(toolsContent, 'STEALTH_BROWSER_GUIDE', guideText);
          await fs.writeFile(toolsMdPath, updatedTools, 'utf8');

          // 5. Generate a basic BROWSER.md helper in workspace if missing
          const browserMdPath = path.join(workspacePath, 'BROWSER.md');
          if (!existsSync(browserMdPath)) {
            const browserMdContent = `# 🌍 Hướng dẫn Browser (Chrome CDP)
- **Script điều khiển:** \`browser-tool.js\`
- **Kết nối Chrome debug:** \`http://127.0.0.1:9222\`
- **Chế độ hoạt động:**
  - **Headless (mặc định):** Chromium chạy ẩn, hoàn toàn tự động. Phù hợp server/VPS.
  - **Chrome thật (trực quan):** Chạy \`start-chrome-debug.bat\` / \`start-chrome-debug.sh\` trên máy host → bot điều khiển Chrome thật trên màn hình.
- **Hành động phổ biến:**
  - \`node browser-tool.js open <url>\` : Mở trang web.
  - \`node browser-tool.js get_text\` : Trích xuất văn bản sạch.
  - \`node browser-tool.js screenshot [path]\` : Chụp ảnh màn hình.
  - \`node browser-tool.js click "<css_selector>"\` : Click chuột.
  - \`node browser-tool.js fill "<css_selector>" "<text>"\` : Nhập liệu.
  - \`node browser-tool.js scroll [px]\` : Cuộn trang.
  - \`node browser-tool.js tabs\` : Liệt kê tab đang mở.
`;
            await fs.writeFile(browserMdPath, browserMdContent, 'utf8');
          }

          logger.info(`[openclaw-smart-search] Synchronized workspace assets for agent: ${a.id}`);
        }
      } catch (err) {
        logger.error(`[openclaw-smart-search] Failed to synchronize workspace assets: ${err.message}`);
      }
    }

    // Run sync asynchronously on startup
    syncWorkspaceAssets().catch((err) => {
      logger.error(`[openclaw-smart-search] Startup sync failed: ${err.message}`);
    });
  }
});

export default plugin;
