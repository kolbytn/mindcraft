#!/usr/bin/env bash
# =============================================================================
# aws/deploy.sh — Deploy / Redeploy Mindcraft to EC2
# =============================================================================
# Run from WSL: bash aws/deploy.sh
# On first run: copies all app files and starts containers
# On subsequent runs: syncs changes and restarts
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Load config ───────────────────────────────────────────────────────────────
[[ -f "$CONFIG_FILE" ]] || error "config.env not found. Run aws/setup.sh first."
# shellcheck source=/dev/null
source "$CONFIG_FILE"

[[ -n "${EC2_IP:-}" ]] || error "EC2_IP not set in config.env"
[[ -n "${KEY_FILE:-}" ]] || error "KEY_FILE not set in config.env"
[[ -f "$KEY_FILE" ]]    || error "SSH key not found: ${KEY_FILE}. Run aws/setup.sh first."

SSH_OPTS="-i ${KEY_FILE} -o StrictHostKeyChecking=no -o ConnectTimeout=10"
SSH="ssh ${SSH_OPTS} ubuntu@${EC2_IP}"
SCP="scp ${SSH_OPTS}"

info "Deploying to ${EC2_IP}..."

# ── Wait for EC2 to be SSH-ready ──────────────────────────────────────────────
info "Checking SSH connectivity..."
RETRIES=20
for i in $(seq 1 $RETRIES); do
  if $SSH "echo ok" >/dev/null 2>&1; then
    break
  fi
  if [[ $i -eq $RETRIES ]]; then
    error "Cannot SSH to ${EC2_IP} after ${RETRIES} attempts. Is the instance running?"
  fi
  warn "SSH not ready yet (attempt ${i}/${RETRIES}), waiting 15s..."
  sleep 15
done
info "SSH connected."

# ── Wait for bootstrap to finish ──────────────────────────────────────────────
info "Checking if EC2 bootstrap is complete..."
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if $SSH "test -f /var/lib/cloud/instance/mindcraft-bootstrap-done" 2>/dev/null; then
    break
  fi
  if [[ $i -eq $RETRIES ]]; then
    warn "Bootstrap may not be done yet — proceeding anyway."
    break
  fi
  warn "Bootstrap still running (attempt ${i}/${RETRIES}), waiting 15s..."
  sleep 15
done

# ── Rsync app files ───────────────────────────────────────────────────────────
info "Syncing application files..."
rsync -avz --delete --ignore-errors \
  -e "ssh ${SSH_OPTS}" \
  --exclude 'node_modules/' \
  --exclude 'minecraft-data/' \
  --exclude 'bots/*/histories/' \
  --exclude 'bots/*/action-code/' \
  --exclude '.git/' \
  --exclude 'aws/mindcraft-ec2.pem' \
  --exclude 'aws/config.env' \
  --exclude 'keys.json' \
  --exclude '.env' \
  --exclude '*.pem' \
  --exclude '*.key' \
  --exclude 'services/viaproxy/logs/' \
  --exclude 'services/viaproxy/jars/' \
  --exclude 'services/viaproxy/plugins/' \
  --exclude 'services/viaproxy/ViaLoader/' \
  --exclude 'services/viaproxy/saves.json' \
  --exclude 'services/viaproxy/viaproxy.yml' \
  --filter 'protect minecraft-data/' \
  --filter 'protect bots/' \
  "${PROJECT_ROOT}/" \
  "ubuntu@${EC2_IP}:/app/"

# ── Generate keys.json from SSM ───────────────────────────────────────────────
info "Pulling secrets from SSM → /app/keys.json on EC2..."
$SSH bash -s <<'REMOTE'
set -euo pipefail

get_param() {
  local name="$1"
  aws ssm get-parameter \
    --region "$(curl -s http://169.254.169.254/latest/meta-data/placement/region)" \
    --name "/mindcraft/${name}" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo ""
}

REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
GEMINI_API_KEY=$(get_param GEMINI_API_KEY)
XAI_API_KEY=$(get_param XAI_API_KEY)
ANTHROPIC_API_KEY=$(get_param ANTHROPIC_API_KEY)
DISCORD_BOT_TOKEN=$(get_param DISCORD_BOT_TOKEN)

cat > /app/keys.json <<KEYS
{
    "OPENAI_API_KEY": "${XAI_API_KEY}",
    "OPENAI_ORG_ID": "",
    "GEMINI_API_KEY": "${GEMINI_API_KEY}",
    "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
    "REPLICATE_API_KEY": "",
    "GROQCLOUD_API_KEY": "",
    "HUGGINGFACE_API_KEY": "",
    "QWEN_API_KEY": "",
    "XAI_API_KEY": "${XAI_API_KEY}",
    "MISTRAL_API_KEY": "",
    "DEEPSEEK_API_KEY": "",
    "GHLF_API_KEY": "",
    "HYPERBOLIC_API_KEY": "",
    "NOVITA_API_KEY": "",
    "OPENROUTER_API_KEY": "",
    "CEREBRAS_API_KEY": "",
    "MERCURY_API_KEY": "",
    "DISCORD_BOT_TOKEN": "${DISCORD_BOT_TOKEN}"
}
KEYS
chmod 600 /app/keys.json
echo "keys.json written."
REMOTE

# ── .env for docker-compose.aws.yml ──────────────────────────────────────────
info "Writing .env on EC2..."
$SSH bash -s <<'REMOTE'
set -euo pipefail
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)

get_param() {
  aws ssm get-parameter \
    --region "$REGION" \
    --name "/mindcraft/$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo ""
}

cat > /app/.env <<ENV
DISCORD_BOT_TOKEN=$(get_param DISCORD_BOT_TOKEN)
BOT_DM_CHANNEL=$(get_param BOT_DM_CHANNEL)
BACKUP_CHAT_CHANNEL=$(get_param BACKUP_CHAT_CHANNEL)
S3_BUCKET=$(get_param S3_BUCKET)
DISCORD_ADMIN_IDS=$(get_param DISCORD_ADMIN_IDS)
GEMINI_API_KEY=$(get_param GEMINI_API_KEY)
XAI_API_KEY=$(get_param XAI_API_KEY)
ANTHROPIC_API_KEY=$(get_param ANTHROPIC_API_KEY)
TAILSCALE_AUTHKEY=$(get_param TAILSCALE_AUTHKEY)
LITELLM_MASTER_KEY=$(get_param LITELLM_MASTER_KEY)
VLLM_BASE_URL=$(get_param VLLM_BASE_URL)
EC2_PUBLIC_IP=$(get_param EC2_PUBLIC_IP)
GITHUB_TOKEN=$(get_param GITHUB_TOKEN)
ENV
chmod 600 /app/.env
echo ".env written."
REMOTE

# ── Start / restart containers ────────────────────────────────────────────────
info "Starting containers with docker-compose.aws.yml..."
$SSH bash -s <<'REMOTE'
set -euo pipefail
cd /app

# Install npm dependencies if node_modules doesn't exist
if [[ ! -d node_modules ]]; then
  echo "Installing npm dependencies..."
  docker run --rm -v "$(pwd)":/app -w /app node:22 npm install --omit=dev
fi

docker compose -f docker-compose.aws.yml up -d --build

echo "Containers started:"
docker compose -f docker-compose.aws.yml ps
REMOTE

# ── Install cron for backups ──────────────────────────────────────────────────
info "Installing backup cron job..."
$SSH bash -s <<'REMOTE'
if [[ -f /app/aws-cron.tab ]]; then
  crontab -u ubuntu /app/aws-cron.tab 2>/dev/null || \
    sudo crontab -u ubuntu /app/aws-cron.tab
  echo "Backup cron installed."
fi
REMOTE

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Minecraft:  ${EC2_IP}:19565"
echo "  Grafana:    http://${EC2_IP}:3004  (admin / admin — change on first login)"
echo "  MindServer: http://${EC2_IP}:8080"
echo ""
echo "  SSH:  ssh -i ${KEY_FILE} ubuntu@${EC2_IP}"
echo "  Logs: ssh ... 'docker compose -f /app/docker-compose.aws.yml logs -f'"
echo ""
