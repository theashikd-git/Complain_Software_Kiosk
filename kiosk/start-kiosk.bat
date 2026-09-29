@echo off
REM ============================================================
REM "Your Opinion" kiosk launcher — Edge version
REM Points this device's Edge browser at the feedback server over
REM HTTPS (self-signed cert — see certs/README.md on the server) so
REM voice recording (microphone access) works. --ignore-certificate-
REM errors skips the "Not secure" warning that self-signed cert would
REM otherwise show, since --kiosk already locks this browser instance
REM to just this one URL — there's no other site it could be tricked
REM into visiting insecurely.
REM
REM Currently set to localhost:3000 — this only works when this
REM .bat file is run ON THE SAME MACHINE as the server itself. If a
REM kiosk touchscreen is a SEPARATE physical device on the network,
REM replace localhost below with this server machine's actual LAN IP
REM (e.g. 10.100.1.6) — the server's cert already covers any IP it
REM was generated for, no other setup needed.
REM ============================================================

set KIOSK_URL=https://10.100.1.6:3000/

set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE_PATH% set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

start "" %EDGE_PATH% ^
  --kiosk "%KIOSK_URL%" ^
  --edge-kiosk-type=fullscreen ^
  --ignore-certificate-errors ^
  --no-first-run ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --user-data-dir="C:\KioskProfile"
