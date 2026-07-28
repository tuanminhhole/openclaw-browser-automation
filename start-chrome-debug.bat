@echo off
REM OPENCLAW_CHROME_PROFILE_V2
echo ====== OpenClaw - Chrome ======
echo.

set "REAL_PROFILE=%LOCALAPPDATA%\Google\Chrome\User Data"
REM Chrome 136+ tu choi --remote-debugging-port khi user-data-dir la profile mac dinh,
REM nen dung mot thu muc rieng (chep tu profile that o lan chay dau).
if "%OPENCLAW_CHROME_PROFILE_DIR%"=="" set "OPENCLAW_CHROME_PROFILE_DIR=%LOCALAPPDATA%\OpenClaw\chrome-profile"

set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_BIN%" set "CHROME_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_BIN%" set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_BIN%" (
  echo LOI: Khong tim thay Google Chrome. Hay cai Chrome roi chay lai.
  pause
  exit /b 1
)

REM Chi dong ban Chrome dieu khien cu neu co - Chrome thuong cua ban van chay binh thuong,
REM vi ban dieu khien dung profile rieng.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*--remote-debugging-port=9222*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
ping -n 3 127.0.0.1 >nul

if not exist "%OPENCLAW_CHROME_PROFILE_DIR%\Default" (
  echo Lan dau: dang dong Chrome de chep profile - cookie, dang nhap...
  taskkill /F /IM chrome.exe >nul 2>&1
  ping -n 4 127.0.0.1 >nul
  echo Dang chep profile Chrome that sang "%OPENCLAW_CHROME_PROFILE_DIR%" ...
  robocopy "%REAL_PROFILE%\Default" "%OPENCLAW_CHROME_PROFILE_DIR%\Default" /E /R:0 /W:0 /NFL /NDL /NJH /NJS /NP ^
    /XD Cache "Code Cache" GPUCache GrShaderCache ShaderCache DawnCache DawnGraphiteCache DawnWebGPUCache "Service Worker" component_crx_cache extensions_crx_cache optimization_guide_model_store blob_storage >nul
  copy /Y "%REAL_PROFILE%\Local State" "%OPENCLAW_CHROME_PROFILE_DIR%\Local State" >nul
)

echo Dang mo Chrome - profile: %OPENCLAW_CHROME_PROFILE_DIR%
start "" "%CHROME_BIN%" ^
  --remote-debugging-port=9222 ^
  --remote-allow-origins=* ^
  --user-data-dir="%OPENCLAW_CHROME_PROFILE_DIR%" ^
  --profile-directory=Default ^
  --no-first-run ^
  --no-default-browser-check
ping -n 6 127.0.0.1 >nul
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://localhost:9222/json/version' -UseBasicParsing -TimeoutSec 5 | Out-Null; Write-Host 'OK! Chrome dang mo cong dieu khien 9222 - bot dung duoc.' -ForegroundColor Green } catch { Write-Host 'LOI: Cong 9222 chua mo. Dong het cua so Chrome roi chay lai file nay.' -ForegroundColor Red }"
echo.
pause
