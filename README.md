# OpenClaw Browser Automation Plugin

Chrome/Chromium browser control for OpenClaw through Chrome DevTools Protocol (CDP).

This plugin owns browser automation only. For search, use OpenClaw's built-in `web_search` capability.

## Workspace Files

On startup, the plugin syncs:

- `browser-tool.js`
- `BROWSER.md`
- one Chrome debug starter for the selected host OS:
  - `start-chrome-debug.bat` on Windows
  - `start-chrome-debug.sh` on macOS/Linux

Legacy search helper files and old plugin skill prompt folders are removed from workspaces.

## Real Chrome Debug Mode

Start Chrome debug on the host machine first:

```bash
start-chrome-debug.bat
```

or:

```bash
./start-chrome-debug.sh
```

Then use:

```bash
node browser-tool.js status
node browser-tool.js open https://example.com
node browser-tool.js get_text
```

The tool tries real host Chrome first and falls back to local headless Chromium for server/VPS use.

