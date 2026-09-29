# TLS certificate for this server

The kiosk's voice recording (microphone access) only works in a browser's
"secure context" — `https://`, or `http://localhost`. When a kiosk
touchscreen is a *separate* device reaching this server over the LAN by IP
(e.g. `http://10.100.1.6:3000`), that's plain HTTP, so browsers block the
microphone. Running the server over HTTPS with a self-signed certificate
fixes this for every browser, with no per-browser policy edits — at the
cost of a one-time "Not secure" warning in each browser, which staff click
through once (Advanced → Proceed).

`server.js` automatically serves over HTTPS if `certs/server.key` and
`certs/server.cert` both exist here, and falls back to plain HTTP otherwise
(so a machine with no cert set up — e.g. local development — keeps working
unchanged). Neither file is committed to git (see `.gitignore`) — a private
key has no business in version control, and the cert is specific to this
server's own IP address.

## Generating the certificate

Requires OpenSSL (already available via Git Bash on Windows, or installed
natively on Linux/macOS). Run from the project root:

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/server.key -out certs/server.cert \
  -days 825 -nodes -subj "/CN=YOUR-SERVER-IP" \
  -addext "subjectAltName=IP:YOUR-SERVER-IP,DNS:localhost,IP:127.0.0.1"
```

Replace `YOUR-SERVER-IP` (in both places) with this server's actual LAN IP
— e.g. `10.100.1.6`. On Git Bash specifically, prefix the command with
`MSYS_NO_PATHCONV=1` or the leading `/CN=...` gets mangled into a
Windows path:

```bash
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -keyout certs/server.key -out certs/server.cert \
  -days 825 -nodes -subj "/CN=YOUR-SERVER-IP" \
  -addext "subjectAltName=IP:YOUR-SERVER-IP,DNS:localhost,IP:127.0.0.1"
```

Then restart the server (`node server.js` / however it's normally started)
— the startup log confirms whether it picked up the cert:

```
Server running on port 3000 (HTTPS, self-signed cert)
```

## If the server's IP ever changes

The certificate is only valid for the IP address baked into it. If this
server is later given a different LAN IP, regenerate the cert with the new
IP using the command above (it overwrites the old files), then restart
the server — no other code changes needed.

## On each kiosk device

`kiosk/start-kiosk.bat` (Edge) and `kiosk/start-kiosk-chrome.bat` (Chrome)
are already set up for this — edit `KIOSK_URL` in your copy to
`https://YOUR-SERVER-IP:3000/`, then run the `.bat`. Both scripts pass
`--ignore-certificate-errors`, so the self-signed cert's "Not secure"
warning never shows at all — no manual click-through, no `.reg` file, no
Chrome/Edge policy. Safe here specifically because `--kiosk` locks that
browser instance to this one URL, so there's no other, untrusted site it
could silently be tricked into loading insecurely.

If you're opening the URL by hand instead of through one of those scripts
(e.g. to test), the browser will show a certificate warning the first
time — click **Advanced → Proceed to YOUR-SERVER-IP (unsafe)** (wording
varies by browser).
