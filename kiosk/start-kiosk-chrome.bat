@echo off
REM ============================================================
REM "Your Opinion" kiosk launcher — Chrome version
REM Requires trust-server-origin-chrome.reg to already be applied
REM on this device (see kiosk-deployment notes) — that's what makes
REM the microphone work; this script just handles fullscreen kiosk
REM mode and touch hardening.
REM
REM Currently set to localhost:3000 — this only works when this
REM .bat file is run ON THE SAME MACHINE as the server itself. If a
REM kiosk touchscreen is a SEPARATE physical device on the network,
REM replace localhost below with this server machine's actual LAN IP
REM (e.g. 192.168.x.x), and update trust-server-origin-chrome.reg to
REM match, so that other devices can reach it.
REM ============================================================

set KIOSK_URL=http://localhost:3000/

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" %CHROME_PATH% ^
  --kiosk "%KIOSK_URL%" ^
  --no-first-run ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --user-data-dir="C:\KioskProfileChrome"
