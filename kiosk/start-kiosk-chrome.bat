@echo off
REM ============================================================
REM "Your Opinion" kiosk launcher — Chrome version
REM Points this device's Chrome browser at the feedback server over
REM HTTPS (self-signed cert — see certs/README.md on the server) so
REM voice recording (microphone access) works. No registry policy
REM needed anymore — --ignore-certificate-errors below skips the
REM "Not secure" warning that self-signed cert would otherwise show,
REM since --kiosk already locks this browser instance to just this
REM one URL, so there's no other site it could be tricked into
REM visiting insecurely.
REM
REM Currently set to localhost:3000 — this only works when this
REM .bat file is run ON THE SAME MACHINE as the server itself. If a
REM kiosk touchscreen is a SEPARATE physical device on the network,
REM replace localhost below with this server machine's actual LAN IP
REM (e.g. 10.100.1.6) — the server's cert already covers any IP it
REM was generated for, no other setup needed.
REM ============================================================

set KIOSK_URL=https://10.100.1.6:3000/

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" %CHROME_PATH% ^
  --kiosk "%KIOSK_URL%" ^
  --ignore-certificate-errors ^
  --no-first-run ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --user-data-dir="C:\KioskProfileChrome"
