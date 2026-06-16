# OpenClaw Browser Automation Plugin

Chrome/Chromium browser control for OpenClaw through Chrome DevTools Protocol (CDP).

This plugin owns browser automation only. For search, use OpenClaw's built-in `web_search` capability.

## Plugin Skill Files

On startup, the plugin syncs files into each bot workspace under `plugin-skills/browser-automation/`:

- `browser-tool.js`
- `BROWSER.md`
- one Chrome debug starter for the selected host OS:
  - `start-chrome-debug.bat` on Windows
  - `start-chrome-debug.sh` on macOS/Linux

Legacy root-level browser/search helper files and old search prompt folders are removed from workspaces.

## Real Chrome Debug Mode

Start Chrome debug on the host machine first:

```bash
plugin-skills\browser-automation\start-chrome-debug.bat
```

or:

```bash
./plugin-skills/browser-automation/start-chrome-debug.sh
```

Then use:

```bash
node plugin-skills/browser-automation/browser-tool.js status
node plugin-skills/browser-automation/browser-tool.js open https://example.com
node plugin-skills/browser-automation/browser-tool.js get_text
```

The tool tries real host Chrome first and falls back to local headless Chromium for server/VPS use.

