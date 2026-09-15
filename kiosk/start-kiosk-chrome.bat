@echo off
REM ============================================================
REM "Your Opinion" kiosk launcher — Chrome version
REM Run this on each kiosk touchscreen device (NOT on the server).
REM Requires trust-server-origin-chrome.reg to already be applied
REM on this device (see kiosk-deployment notes) — that's what makes
REM the microphone work; this script just handles fullscreen kiosk
REM mode and touch hardening.
REM ============================================================

set KIOSK_URL=http://10.100.1.40:3000/

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" %CHROME_PATH% ^
  --kiosk "%KIOSK_URL%" ^
  --no-first-run ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --user-data-dir="C:\KioskProfileChrome"
