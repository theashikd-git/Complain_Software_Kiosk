@echo off
REM ============================================================
REM "Your Opinion" kiosk launcher
REM Points this device's Edge browser at the feedback server and
REM treats that address as secure so voice recording (microphone
REM access) works over plain http:// on the LAN.
REM
REM Currently set to localhost:3000 — this only works when this
REM .bat file is run ON THE SAME MACHINE as the server itself. If a
REM kiosk touchscreen is a SEPARATE physical device on the network,
REM replace localhost below with this server machine's actual LAN IP
REM (e.g. 192.168.x.x) so that other devices can reach it.
REM ============================================================

set KIOSK_URL=http://localhost:3000/
set SERVER_ORIGIN=http://localhost:3000

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
