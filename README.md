# OpenClaw Browser Automation Plugin

Chrome/Chromium browser control for OpenClaw through Chrome DevTools Protocol (CDP).

This plugin owns browser automation only. For search, use OpenClaw's built-in `web_search` capability.

## Plugin Skill Files

On startup, the plugin installs a skill into each bot workspace under `skills/browser-automation/`
(the `skills/` directory is the skill source OpenClaw scans at the highest precedence):

- `SKILL.md` — skill instructions with YAML frontmatter so OpenClaw's skill loader registers it
- `browser-tool.js`
- one Chrome debug starter for the selected host OS:
  - `start-chrome-debug.bat` on Windows
  - `start-chrome-debug.sh` on macOS/Linux

Legacy root-level browser/search helper files, old search prompt folders, and the previous
wrong-location assets (`plugin-skills/browser-automation`) are removed from workspaces.

## Real Chrome Debug Mode

The starter runs Chrome on a dedicated profile directory (`%LOCALAPPDATA%\OpenClaw\chrome-profile`,
`~/Library/Application Support/OpenClaw/chrome-profile`, `~/.config/openclaw/chrome-profile`), seeded
once from the operator's own profile so pages still see the usual cookies, logins and extensions.
Chrome 136+ refuses `--remote-debugging-port` when `--user-data-dir` is the default profile itself —
Chrome opens and port 9222 never answers — which is why the copy exists. Point
`OPENCLAW_CHROME_PROFILE_DIR` anywhere else to override.

If no host Chrome is running, the container keeps its own headless Chromium on `127.0.0.1:9222`, so
`browser-tool.js` works either way: it prefers the host Chrome and falls back to the local one.

Start Chrome debug on the host machine first:

```bash
skills\browser-automation\start-chrome-debug.bat
```

or:

```bash
./skills/browser-automation/start-chrome-debug.sh
```

Then use:

```bash
node skills/browser-automation/browser-tool.js status
node skills/browser-automation/browser-tool.js open https://example.com
node skills/browser-automation/browser-tool.js get_text
```

The tool tries real host Chrome first and falls back to local headless Chromium for server/VPS use.

