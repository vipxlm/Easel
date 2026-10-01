#!/usr/bin/env bash
set -euo pipefail
cd /app
mkdir -p outputs assets profiles
if [ ! -f .env ]; then
    touch .env
    chmod 600 .env
fi
if [ ! -f /root/.openclaw-easel/openclaw.json ]; then
    openclaw --profile easel onboard --non-interactive --mode local --accept-risk \
        --skip-health --skip-channels --skip-skills --skip-ui --skip-hooks \
        --skip-search --skip-daemon
    openclaw --profile easel config set agents.defaults.timeoutSeconds 7200
    openclaw --profile easel config set agents.defaults.thinkingDefault "${EASEL_THINKING_LEVEL:-low}"
    openclaw --profile easel config set memory.search.enabled false --strict-json
    openclaw --profile easel config set gateway.mode local
    openclaw --profile easel config set gateway.bind loopback
    openclaw --profile easel config set gateway.auth.mode none
    openclaw --profile easel config set gateway.http.endpoints.chatCompletions.enabled true --strict-json
fi
if [ -f scripts/patch_openclaw_streaming.py ]; then
    python scripts/patch_openclaw_streaming.py
fi
openclaw --profile easel config validate
bash openclaw/sync.sh
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
bash scripts/gateway.sh start
gateway_port=$(python -c 'from easel.gateway_endpoint import resolve_gateway_port; print(resolve_gateway_port())')
for attempt in {1..60}; do
    if curl -fsS --max-time 2 "http://127.0.0.1:${gateway_port}/healthz" >/dev/null; then
        easel web --port "${EASEL_PORT:-7870}" &
        web_pid=$!
        shutdown() {
            bash scripts/gateway.sh stop
            kill -TERM "$web_pid" 2>/dev/null || true
            wait "$web_pid" 2>/dev/null || true
            sleep 5
        }
        trap 'shutdown; exit 0' TERM INT
        set +e
        wait "$web_pid"
        web_status=$?
        set -e
        shutdown
        exit "$web_status"
    fi
    sleep 1
done
tail -50 /tmp/easel-gateway.log >&2
exit 1
