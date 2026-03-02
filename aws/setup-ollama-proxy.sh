#!/usr/bin/env bash
# =============================================================================
# aws/setup-ollama-proxy.sh — Set up socat proxy for Ollama via Tailscale
# =============================================================================
# Runs on EC2 host. Creates a systemd service that proxies localhost:11435
# to the local Ollama instance via Tailscale (set OLLAMA_TAILSCALE_IP env var).
#
# Why: Docker containers (even with network_mode: host) have issues routing
# data through Tailscale's TUN interface. This proxy runs as a native host
# process, which can use Tailscale routing without issues.
#
# Usage:
#   sudo bash /app/aws/setup-ollama-proxy.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

if [ -z "${OLLAMA_TAILSCALE_IP:-}" ]; then
    error "OLLAMA_TAILSCALE_IP is required. Set it to your local machine's Tailscale IP (e.g. 100.x.x.x)"
fi
OLLAMA_REMOTE="${OLLAMA_TAILSCALE_IP}:11434"
PROXY_PORT="11435"
SERVICE_NAME="ollama-proxy"

# ── Install socat if needed ──────────────────────────────────────────────────
if ! command -v socat &>/dev/null; then
    info "Installing socat..."
    apt-get update -qq && apt-get install -y -qq socat
else
    info "socat already installed."
fi

# ── Create systemd service ───────────────────────────────────────────────────
info "Creating systemd service: ${SERVICE_NAME}"
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Ollama Tailscale Proxy (socat localhost:${PROXY_PORT} -> ${OLLAMA_REMOTE})
After=network.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/socat TCP4-LISTEN:${PROXY_PORT},bind=127.0.0.1,reuseaddr,fork TCP4:${OLLAMA_REMOTE}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ── Kill any stale socat processes on the proxy port ─────────────────────────
if pgrep -f "socat.*${PROXY_PORT}" &>/dev/null; then
    info "Killing stale socat processes on port ${PROXY_PORT}..."
    pkill -f "socat.*${PROXY_PORT}" || true
    sleep 1
fi

# ── Enable and start ─────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
sleep 2

# ── Verify ───────────────────────────────────────────────────────────────────
if systemctl is-active --quiet "${SERVICE_NAME}"; then
    info "Service ${SERVICE_NAME} is running."
else
    warn "Service ${SERVICE_NAME} failed to start. Check: journalctl -u ${SERVICE_NAME}"
fi

# Quick connectivity test
info "Testing proxy connectivity..."
if curl -s --max-time 10 "http://127.0.0.1:${PROXY_PORT}/api/tags" | grep -q "models"; then
    info "Ollama reachable through proxy at localhost:${PROXY_PORT}"
else
    warn "Could not reach Ollama through proxy. Is Ollama running on your local machine?"
    warn "Is Tailscale connected? Check: tailscale status (in the tailscale container)"
fi

# ── Restart mindcraft to pick up the new profile URL ─────────────────────────
info "Restarting mindcraft container..."
cd /app
docker compose -f docker-compose.aws.yml up -d --no-deps --force-recreate mindcraft

echo ""
info "Done! LocalAndy will now connect to Ollama via localhost:${PROXY_PORT} -> Tailscale -> ${OLLAMA_REMOTE}"
echo ""
