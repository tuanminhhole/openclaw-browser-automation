# OpenClaw Browser Automation Plugin

Chrome/Chromium browser control for OpenClaw through Chrome DevTools Protocol (CDP).

This plugin owns browser automation only. For search, use OpenClaw's built-in `web_search` capability.

## What it changes in your project

A browser controller has to touch the runtime it drives, so this plugin edits files outside its own
folder on startup. Every change is listed here, each one can be switched off, the original of every
edited file is saved next to it as `*.bak-browser-automation`, and what actually happened is written
to `.openclaw/browser-automation-install-report.json` (and logged line by line at startup).

| What | Where | Switch off with |
| --- | --- | --- |
| Enables browser control and points it at a CDP endpoint: `browser.enabled`, `browser.profiles['host-chrome'].cdpUrl`, and — only when that Chrome is a host on a private IP — `browser.ssrfPolicy.dangerouslyAllowPrivateNetwork` | `.openclaw/openclaw.json` | `manageBrowserConfig: false` |
| Adds a cached Playwright/Chromium layer, a local headless Chromium on `127.0.0.1:9222` (loopback only), and `host.docker.internal` so the container can reach a Chrome on the host. All inside `OPENCLAW:SMART_SEARCH_BROWSER*` managed blocks | `docker/openclaw/Dockerfile`, `entrypoint.sh`, `docker-compose.yml` | `patchDocker: false` |
| Writes the skill the bot reads: `browser-tool.js`, `SKILL.md`, one `start-chrome-debug.*` for your OS | `<workspace>/skills/browser-automation/` | `syncWorkspaceSkill: false` |
| Deletes assets **earlier versions of this plugin** left in the wrong place (workspace-root `browser-tool.js` / `BROWSER.md` / `search-tool.js`, `plugin-skills/browser-automation`, `cl-stealth-search`, `openclaw-smart-search`). Only those exact names — nothing you wrote | `<workspace>/` | `cleanupLegacyAssets: false` |

Switches go in `plugins.entries["browser-automation"].config`. To undo everything: restore the
`*.bak-browser-automation` files, or delete the `OPENCLAW:SMART_SEARCH_BROWSER*` blocks by hand.

## High-impact capabilities

The browser tool drives a real browser, and on a desktop that is **your** Chrome session — your
cookies and logins. Two commands go beyond reading and clicking, both on by default because they are
part of what a browser tool is for, both switchable:

- `evaluate "<js>"` — runs arbitrary JavaScript in the page with the page's own privileges. Off with
  `allowPageScripting: false`.
- `upload "<selector>" "<file>"` — puts a local file into a page's file input, so local data can
  leave for a remote site. Off with `allowFileUpload: false`.

The generated `SKILL.md` tells the agent to prefer the plain read/click commands, to treat every page
as your account (no signing out, no settings changes, no unrequested submits), and to only upload a
file you named.

The debug port itself is never exposed off the machine: the in-container Chromium binds
`127.0.0.1:9222`, and a host Chrome is reached over the Docker host-gateway, not published.

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

