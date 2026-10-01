FROM node:24-bookworm-slim AS frontend
WORKDIR /frontend
COPY web/frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim
ARG OPENCLAW_VERSION=2026.9.7
ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/opt/venv/bin:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/opt/browsers \
    EASEL_ROOT=/app \
    EASEL_PORT=7870 \
    PYTHONUNBUFFERED=1 \
    DISPLAY=:99
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-dev build-essential git curl ffmpeg \
    iproute2 procps xvfb xauth fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv \
    && npm install -g openclaw@${OPENCLAW_VERSION}
WORKDIR /app
COPY pyproject.toml ./
COPY easel/ easel/
RUN pip install --no-cache-dir -e . \
    && python -m playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pdfplumber requests \
    && python -c 'from playwright.sync_api import sync_playwright; import os; p=sync_playwright().start(); os.symlink(p.chromium.executable_path, "/usr/local/bin/chrome"); p.stop()'
ENV CHROME_PATH=/usr/local/bin/chrome
RUN apt-get update && apt-get install -y --no-install-recommends x11vnc novnc websockify \
    && rm -rf /var/lib/apt/lists/*
COPY docker/start-desktop.sh /usr/local/bin/easel-start-desktop
RUN chmod +x /usr/local/bin/easel-start-desktop
COPY . .
COPY --from=frontend /frontend/dist web/frontend/dist
COPY docker/entrypoint.sh /usr/local/bin/easel-entrypoint
RUN chmod +x /usr/local/bin/easel-entrypoint
EXPOSE 7870
ENTRYPOINT ["easel-entrypoint"]
