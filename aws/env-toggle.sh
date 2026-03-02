#!/usr/bin/env bash
# =============================================================================
# aws/env-toggle.sh — Ensure only one environment runs Mindcraft at a time
# =============================================================================
# Usage:
#   bash aws/env-toggle.sh --aws     # Start AWS, stop local
#   bash aws/env-toggle.sh --local   # Stop AWS workloads, start local
#   bash aws/env-toggle.sh --auto    # Check EC2 state and toggle accordingly
#   bash aws/env-toggle.sh --status  # Just show what's running
#
# NOTE: Docker is not accessible from WSL on this system.
#       Run local docker commands from Windows CMD/PowerShell.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[env-toggle]${NC} $*"; }
warn()  { echo -e "${YELLOW}[env-toggle]${NC} $*"; }
error() { echo -e "${RED}[env-toggle]${NC} $*"; exit 1; }

# ── Load config ───────────────────────────────────────────────────────────────
[[ -f "$CONFIG_FILE" ]] || error "config.env not found. Run aws/setup.sh first."
# shellcheck source=/dev/null
source "$CONFIG_FILE"

# ── Helpers ───────────────────────────────────────────────────────────────────

check_ec2_state() {
    aws ec2 describe-instances \
        --region "$REGION" \
        --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null || echo "unknown"
}

start_aws() {
    local state
    state=$(check_ec2_state)
    if [[ "$state" == "running" ]]; then
        info "EC2 already running (${INSTANCE_ID})"
        return
    fi
    info "Starting EC2 instance ${INSTANCE_ID}..."
    aws ec2 start-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null
    aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

    # Get new public IP (changes on stop/start unless Elastic IP)
    EC2_IP=$(aws ec2 describe-instances \
        --region "$REGION" \
        --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    sed -i "s/^EC2_IP=.*/EC2_IP=${EC2_IP}/" "$CONFIG_FILE"
    info "EC2 running at ${EC2_IP}"
}

stop_aws() {
    local state
    state=$(check_ec2_state)
    if [[ "$state" == "stopped" ]]; then
        info "EC2 already stopped."
        return
    fi
    info "Stopping Mindcraft containers on EC2..."
    SSH_OPTS="-i ${KEY_FILE} -o StrictHostKeyChecking=no -o ConnectTimeout=5"
    ssh ${SSH_OPTS} ubuntu@${EC2_IP} \
        "cd /app && docker compose -f docker-compose.aws.yml stop" 2>/dev/null || true

    info "Stopping EC2 instance ${INSTANCE_ID}..."
    aws ec2 stop-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null
    info "EC2 stopping (saves money while local is active)"
}

stop_local() {
    warn "To stop local Mindcraft containers, run from Windows CMD:"
    echo ""
    echo "  docker compose -f docker-compose.yml stop mindcraft discord-bot"
    echo ""
    warn "Docker is not accessible from WSL. Run the above in CMD or PowerShell."
}

start_local() {
    warn "To start local Mindcraft containers, run from Windows CMD:"
    echo ""
    echo "  docker compose -f docker-compose.yml up -d"
    echo ""
    warn "Docker is not accessible from WSL. Run the above in CMD or PowerShell."
}

show_status() {
    local state
    state=$(check_ec2_state)
    echo ""
    info "AWS EC2: ${state} (${INSTANCE_ID})"
    if [[ "$state" == "running" ]]; then
        echo "  IP: ${EC2_IP}"
        echo "  Minecraft: ${EC2_IP}:19565"
        echo "  Grafana:   http://${EC2_IP}:3004"
        echo "  MindServer: http://${EC2_IP}:8080"
    fi
    echo ""
    info "Local Docker: check from Windows CMD with 'docker compose ps'"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-}" in
    --aws)
        info "Switching to AWS environment..."
        start_aws
        stop_local
        info "AWS is active. Local containers should be stopped."
        ;;
    --local)
        info "Switching to local environment..."
        stop_aws
        start_local
        info "AWS stopped. Start local containers from Windows CMD."
        ;;
    --auto)
        state=$(check_ec2_state)
        if [[ "$state" == "running" ]]; then
            info "EC2 is running → ensuring local is stopped"
            stop_local
        else
            info "EC2 is ${state} → local environment should be active"
            start_local
        fi
        ;;
    --status)
        show_status
        ;;
    *)
        echo "Usage: bash aws/env-toggle.sh [--aws | --local | --auto | --status]"
        echo ""
        echo "  --aws     Start AWS EC2, remind to stop local"
        echo "  --local   Stop AWS EC2, remind to start local"
        echo "  --auto    Check EC2 state and advise accordingly"
        echo "  --status  Show what's running where"
        exit 1
        ;;
esac
