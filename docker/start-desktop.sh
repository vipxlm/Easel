#!/usr/bin/env bash
set -euo pipefail
state=/root/.easel-desktop
mkdir -p "$state"
chmod 700 "$state"
if [ ! -f "$state/password" ]; then
    python -c 'import secrets,pathlib; p=pathlib.Path("/root/.easel-desktop/password"); p.write_text(secrets.token_hex(4)); p.chmod(0o600)'
fi
if [ ! -f "$state/vnc-password" ]; then
    x11vnc -storepasswd "$(cat "$state/password")" "$state/vnc-password" >/dev/null 2>&1
    chmod 600 "$state/vnc-password"
fi
if ! pgrep -x x11vnc >/dev/null; then
    nohup x11vnc -display :99 -rfbauth "$state/vnc-password" -localhost \
        -rfbport 5900 -forever -shared -noxdamage > /tmp/easel-vnc.log 2>&1 &
fi
if ! pgrep -f "^/usr/bin/python3 /usr/bin/websockify" >/dev/null; then
    nohup /usr/bin/websockify --web=/usr/share/novnc 6080 127.0.0.1:5900 \
        > /tmp/easel-novnc.log 2>&1 &
fi
printf "Desktop started. Password file: %s/password\n" "$state"
