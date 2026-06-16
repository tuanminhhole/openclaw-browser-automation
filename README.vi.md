# Plugin OpenClaw Browser Automation

Dieu khien Chrome/Chromium cho OpenClaw qua Chrome DevTools Protocol (CDP).

Plugin nay chi phu trach tu dong hoa trinh duyet. Khi can tim kiem web, dung nang luc `web_search` co san cua OpenClaw.

## File duoc dong bo vao plugin-skill

Khi khoi dong, plugin dong bo vao tung workspace bot tai `plugin-skills/browser-automation/`:

- `browser-tool.js`
- `BROWSER.md`
- mot file mo Chrome debug dung theo OS host:
  - `start-chrome-debug.bat` tren Windows
  - `start-chrome-debug.sh` tren macOS/Linux

Nhung file browser/search cu o root workspace va prompt folder search cu se duoc don khoi workspace.

## Dung Chrome that

Mo Chrome debug tren may host truoc:

```bash
plugin-skills\browser-automation\start-chrome-debug.bat
```

hoac:

```bash
./plugin-skills/browser-automation/start-chrome-debug.sh
```

Sau do dung:

```bash
node plugin-skills/browser-automation/browser-tool.js status
node plugin-skills/browser-automation/browser-tool.js open https://example.com
node plugin-skills/browser-automation/browser-tool.js get_text
```

Tool se uu tien Chrome that tren host. Neu khong co Chrome debug, tool fallback sang Chromium headless phu hop cho VPS/server.
