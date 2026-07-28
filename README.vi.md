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

File mo Chrome chay bang mot profile rieng (`%LOCALAPPDATA%\OpenClaw\chrome-profile`,
`~/Library/Application Support/OpenClaw/chrome-profile`, `~/.config/openclaw/chrome-profile`), lan dau
tu chep tu profile that nen trang web van thay cookie/dang nhap/extension quen thuoc. Chrome 136+ TU
CHOI `--remote-debugging-port` khi `--user-data-dir` la profile mac dinh (Chrome van mo nhung cong 9222
khong bao gio len) — do la ly do phai chep. Muon dung cho khac thi dat `OPENCLAW_CHROME_PROFILE_DIR`.

Neu host khong co Chrome debug, container tu giu mot Chromium headless o `127.0.0.1:9222` nen
`browser-tool.js` van chay: uu tien Chrome host, khong co thi dung ban local.

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
