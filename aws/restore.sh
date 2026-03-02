#!/usr/bin/env bash
# =============================================================================
# aws/restore.sh — Restore Minecraft world and bot memory from S3
# =============================================================================
# Run from local: bash aws/restore.sh
# WARNING: This overwrites local data on EC2. Use with caution.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[RESTORE]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Detect if running locally (SSH to EC2) or on EC2 directly ────────────────
if [[ -f "$CONFIG_FILE" ]]; then
  # Running locally — SSH to EC2 and run restore there
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
  [[ -n "${EC2_IP:-}" ]] || error "EC2_IP not set in config.env"

  echo ""
  warn "WARNING: This will OVERWRITE the current world and bot memory on EC2 with S3 data."
  read -r -p "Are you sure? Type 'yes' to confirm: " CONFIRM
  [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 0; }

  SSH_OPTS="-i ${KEY_FILE} -o StrictHostKeyChecking=no"
  info "Running restore on EC2 (${EC2_IP}) via SSH..."
  ssh ${SSH_OPTS} ubuntu@${EC2_IP} "bash /app/aws/restore.sh --confirmed"
  exit 0
fi

# ── Running ON EC2 ────────────────────────────────────────────────────────────
[[ "${1:-}" == "--confirmed" ]] || { echo "Run this from your local machine via: bash aws/restore.sh"; exit 1; }

REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null \
  || echo "${AWS_DEFAULT_REGION:-us-east-1}")
S3_BUCKET=$(aws ssm get-parameter \
  --region "$REGION" \
  --name "/mindcraft/S3_BUCKET" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text 2>/dev/null \
  || grep S3_BUCKET /app/.env | cut -d= -f2 || "")

[[ -n "$S3_BUCKET" ]] || error "S3_BUCKET not found"

APP_DIR="/app"

# ── Stop all services ─────────────────────────────────────────────────────────
info "Stopping all containers..."
docker compose -f "${APP_DIR}/docker-compose.aws.yml" stop minecraft mindcraft

# ── Restore world from S3 ─────────────────────────────────────────────────────
info "Restoring minecraft-data from s3://${S3_BUCKET}/minecraft-data/ ..."
mkdir -p "${APP_DIR}/minecraft-data"
aws s3 sync \
  "s3://${S3_BUCKET}/minecraft-data/" \
  "${APP_DIR}/minecraft-data" \
  --sse AES256 \
  --region "$REGION" \
  --delete

# ── Restore bot memory from S3 ────────────────────────────────────────────────
info "Restoring bot memory from s3://${S3_BUCKET}/bots/ ..."
aws s3 sync \
  "s3://${S3_BUCKET}/bots/" \
  "${APP_DIR}/bots/" \
  --sse AES256 \
  --region "$REGION"

# ── Restart services ──────────────────────────────────────────────────────────
info "Restarting containers..."
docker compose -f "${APP_DIR}/docker-compose.aws.yml" up -d minecraft mindcraft

info "Restore complete."
