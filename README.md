# OpenClaw Smart Search & Browser Automation Plugin 🌐

Consolidated, zero-token, Cloudflare-bypassing Smart Search and dynamic Browser CDP controller plugin for OpenClaw.

## 🚀 Features

1. **Smart Search (`search-tool.js`)**: 
   - No API Key required, free of charge.
   - Bypasses Cloudflare limits by using dynamic headless stealth Chromium.
   - DuckDuckGo / Google search aggregator.
2. **Browser Automation (`browser-tool.js`)**:
   - Advanced Chrome DevTools Protocol (CDP) client.
   - Control real desktop Chrome or container Chrome dynamically.
   - Capture screenshots, fill forms, execute JS snippets, scrape posts, extract clean inner text.
3. **Automated Provisioning**:
   - Auto-copies search and browser tools, debugging scripts, and markdown guides (`SKILL.md`, `BROWSER.md`) into all active agents' workspace folders.
   - Dynamically patches `TOOLS.md` with system guidelines on boot.

## 📦 Installation

To install via ClawHub or directly into your OpenClaw plugins folder:

```bash
openclaw plugins install clawhub:openclaw-browser-automation
```

Or clone this repository into your `.openclaw/extensions/` folder:

```bash
git clone https://github.com/tuanminhhole/openclaw-browser-automation.git .openclaw/extensions/browser-automation
```

## 🛠️ Usage

Once enabled, the plugin automatically provisions workspace scripts. The bot can execute commands via `exec`/terminal tools:

```bash
# 🔍 Stealth Search
node search-tool.js "latest gold prices" 5

# 🌐 Browser Automation
node browser-tool.js open "https://vnexpress.net"
node browser-tool.js get_text
node browser-tool.js screenshot
```

## 📄 License

MIT
