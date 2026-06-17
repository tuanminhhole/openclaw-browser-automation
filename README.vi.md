# Plugin OpenClaw Browser Automation

Dieu khien Chrome/Chromium cho OpenClaw qua Chrome DevTools Protocol (CDP).

Plugin nay chi phu trach tu dong hoa trinh duyet. Khi can tim kiem web, dung nang luc `web_search` co san cua OpenClaw.

## File duoc cai vao skill

Khi khoi dong, plugin cai mot skill vao tung workspace bot tai `skills/browser-automation/`
(thu muc `skills/` la nguon skill OpenClaw quet voi uu tien cao nhat):

- `SKILL.md` — huong dan skill kem YAML frontmatter de skill-loader cua OpenClaw nhan dien
- `browser-tool.js`
- mot file mo Chrome debug dung theo OS host:
  - `start-chrome-debug.bat` tren Windows
  - `start-chrome-debug.sh` tren macOS/Linux

Nhung file browser/search cu o root workspace, prompt folder search cu, va asset sai vi tri truoc day
(`plugin-skills/browser-automation`) se duoc don khoi workspace.

## Dung Chrome that

Mo Chrome debug tren may host truoc:

```bash
skills\browser-automation\start-chrome-debug.bat
```

hoac:

```bash
./skills/browser-automation/start-chrome-debug.sh
```

Sau do dung:

```bash
node skills/browser-automation/browser-tool.js status
node skills/browser-automation/browser-tool.js open https://example.com
node skills/browser-automation/browser-tool.js get_text
```

Tool se uu tien Chrome that tren host. Neu khong co Chrome debug, tool fallback sang Chromium headless phu hop cho VPS/server.
