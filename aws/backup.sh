#!/usr/bin/env bash
# =============================================================================
# aws/backup.sh — Backup Minecraft world and bot memory to S3
# =============================================================================
# Run manually: bash aws/backup.sh
# Also runs automatically every 6 hours via cron (installed by deploy.sh)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[BACKUP $(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

# ── Detect if running locally (SSH to EC2) or on EC2 directly ────────────────
if [[ -f "$CONFIG_FILE" ]]; then
  # Running locally — SSH to EC2 and run backup there
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
  [[ -n "${EC2_IP:-}" ]] || { echo "EC2_IP not set"; exit 1; }
  SSH_OPTS="-i ${KEY_FILE} -o StrictHostKeyChecking=no"
  info "Running backup on EC2 (${EC2_IP}) via SSH..."
  ssh ${SSH_OPTS} ubuntu@${EC2_IP} "bash /app/aws/backup.sh"
  exit 0
fi

# ── Running ON EC2 ────────────────────────────────────────────────────────────
# Get region and bucket from instance metadata + SSM
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null \
  || echo "${AWS_DEFAULT_REGION:-us-east-1}")
S3_BUCKET=$(aws ssm get-parameter \
  --region "$REGION" \
  --name "/mindcraft/S3_BUCKET" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text 2>/dev/null \
  || grep S3_BUCKET /app/.env | cut -d= -f2 || "")

[[ -n "$S3_BUCKET" ]] || { echo "ERROR: S3_BUCKET not found"; exit 1; }

APP_DIR="/app"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# ── Stop Minecraft briefly (prevents corrupted world files) ───────────────────
MINECRAFT_WAS_RUNNING=false
if docker compose -f "${APP_DIR}/docker-compose.aws.yml" ps minecraft 2>/dev/null | grep -q "Up"; then
  MINECRAFT_WAS_RUNNING=true
  info "Stopping Minecraft for consistent backup..."
  docker compose -f "${APP_DIR}/docker-compose.aws.yml" stop minecraft
  sleep 2
fi

# ── Backup world to S3 ────────────────────────────────────────────────────────
info "Syncing minecraft-data → s3://${S3_BUCKET}/minecraft-data/ ..."
aws s3 sync \
  "${APP_DIR}/minecraft-data" \
  "s3://${S3_BUCKET}/minecraft-data/" \
  --sse AES256 \
  --region "$REGION" \
  --delete

# ── Backup bot memory to S3 ───────────────────────────────────────────────────
info "Syncing bots/ memory → s3://${S3_BUCKET}/bots/ ..."
# Only sync memory.json and learnings.json (skip histories/ which are huge)
find "${APP_DIR}/bots" -maxdepth 2 \( -name "memory.json" -o -name "learnings.json" \) \
  -exec aws s3 cp {} "s3://${S3_BUCKET}/bots/$(basename "$(dirname {})")/$(basename {})" \
    --sse AES256 --region "$REGION" \;

# ── Restart Minecraft ─────────────────────────────────────────────────────────
if [[ "$MINECRAFT_WAS_RUNNING" == "true" ]]; then
  info "Restarting Minecraft..."
  docker compose -f "${APP_DIR}/docker-compose.aws.yml" start minecraft
fi

info "Backup complete. s3://${S3_BUCKET}/ (timestamp: ${TIMESTAMP})"
