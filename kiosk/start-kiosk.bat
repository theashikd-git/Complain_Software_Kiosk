@echo off
REM ============================================================
REM "Your Opinion" kiosk launcher
REM Run this on each kiosk touchscreen device (NOT on the server).
REM Points this device's Edge browser at the feedback server and
REM treats that address as secure so voice recording (microphone
REM access) works over plain http:// on the LAN.
REM ============================================================

set KIOSK_URL=http://10.100.1.40:3000/
set SERVER_ORIGIN=http://10.100.1.40:3000

set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE_PATH% set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

start "" %EDGE_PATH% ^
  --kiosk "%KIOSK_URL%" ^
  --edge-kiosk-type=fullscreen ^
  --unsafely-treat-insecure-origins-as-secure=%SERVER_ORIGIN% ^
  --no-first-run ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --user-data-dir="C:\KioskProfile"
