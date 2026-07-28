# Plugin OpenClaw Browser Automation

Dieu khien Chrome/Chromium cho OpenClaw qua Chrome DevTools Protocol (CDP).

Plugin nay chi phu trach tu dong hoa trinh duyet. Khi can tim kiem web, dung nang luc `web_search` co san cua OpenClaw.

## Plugin sua gi trong project cua ban

Mot plugin dieu khien trinh duyet buoc phai sua runtime no dieu khien, nen khi khoi dong plugin co
ghi vao vai file ngoai thu muc cua no. Tat ca duoc liet ke o day, moi thu deu **tat duoc**, file goc
luon duoc luu ben canh dang `*.bak-browser-automation`, va viec da lam that su duoc ghi ra
`.openclaw/browser-automation-install-report.json` (kem log tung dong luc khoi dong).

| Sua gi | O dau | Tat bang |
| --- | --- | --- |
| Bat browser control va tro no vao mot endpoint CDP: `browser.enabled`, `browser.profiles['host-chrome'].cdpUrl`, va — chi khi Chrome do nam tren IP noi bo cua host — `browser.ssrfPolicy.dangerouslyAllowPrivateNetwork` | `.openclaw/openclaw.json` | `manageBrowserConfig: false` |
| **Mac dinh TAT** (`patchDocker: true` de cho phep): them layer Playwright/Chromium (co cache), mot Chromium headless o `127.0.0.1:9222` (chi loopback), va `host.docker.internal` de container goi duoc Chrome tren host. Tat ca nam trong block `OPENCLAW:SMART_SEARCH_BROWSER*` | `docker/openclaw/Dockerfile`, `entrypoint.sh`, `docker-compose.yml` | dang tat san - dat `patchDocker: true` neu muon bat |
| Ghi skill ma bot doc: `browser-tool.js`, `SKILL.md`, mot file `start-chrome-debug.*` dung theo OS | `<workspace>/skills/browser-automation/` | `syncWorkspaceSkill: false` |
| Xoa file **do ban plugin cu nay** dat sai cho (`browser-tool.js` / `BROWSER.md` / `search-tool.js` o goc workspace, `plugin-skills/browser-automation`, `cl-stealth-search`, `openclaw-smart-search`). Chi dung nhung ten do — khong dung tay vao file ban tu viet | `<workspace>/` | `cleanupLegacyAssets: false` |

Cac cong tac dat trong `plugins.entries["browser-automation"].config`. Muon hoan nguyen: khoi phuc
cac file `*.bak-browser-automation`, hoac xoa tay cac block `OPENCLAW:SMART_SEARCH_BROWSER*`.

## Hai lenh co suc cong pha lon

Tool dieu khien trinh duyet that, va tren may desktop do chinh la **phien Chrome cua ban** — cookie
va dang nhap cua ban. Hai lenh sau vuot qua muc doc/click. Ca hai mac dinh TAT, phai ban cho phep
moi dung duoc, va duyet web binh thuong khong can den chung:

- `evaluate "<js>"` — chay JavaScript tuy y trong trang, voi dung quyen cua trang. **Mac dinh TAT**;
  bat bang `allowPageScripting: true`.
- `upload "<selector>" "<file>"` — day mot file tren may vao o upload cua trang web, tuc la du lieu
  local roi may di. **Mac dinh TAT**; bat bang `allowFileUpload: true`.

Doc trang, click, dien form, screenshot, quan ly tab thi khong can co gi — do la duyet web binh
thuong, dung duoc ngay.

File mo Chrome tao profile dieu khien **trong**: ban dang nhap 1 lan trong cua so no mo ra. No KHONG
nhan ban cookie/dang nhap cua ban tru khi ban tu yeu cau bang `OPENCLAW_CHROME_SEED_PROFILE=1`, va
chi duong do moi phai dong cac cua so Chrome dang mo.

`SKILL.md` sinh ra da noi ro cho agent: uu tien cac lenh doc/click thong thuong, coi moi trang la
tai khoan cua ban (khong dang xuat, khong doi cai dat, khong submit khi khong duoc yeu cau), va chi
upload file ban chi dinh.

Cong debug khong bao gio lo ra ngoai may: Chromium trong container bind `127.0.0.1:9222`, con Chrome
tren host thi di qua host-gateway cua Docker chu khong publish cong.

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
`~/Library/Application Support/OpenClaw/chrome-profile`, `~/.config/openclaw/chrome-profile`) — phai
la thu muc rieng vi Chrome 136+ TU CHOI `--remote-debugging-port` khi `--user-data-dir` la profile mac
dinh (Chrome van mo nhung cong 9222 khong bao gio len).

Profile do ban dau TRONG, ban dang nhap 1 lan. Neu muon dung san dang nhap co roi thi chay kem
`OPENCLAW_CHROME_SEED_PROFILE=1` — luc do no chep cookie, dang nhap, lich su, extension sang profile
dieu khien va phai dong cac cua so Chrome dang mo. Muon dung thu muc khac thi dat
`OPENCLAW_CHROME_PROFILE_DIR`.

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
