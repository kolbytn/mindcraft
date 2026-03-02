#!/usr/bin/env bash
# =============================================================================
# aws/ec2-go.sh — One-command Mindcraft deploy
# =============================================================================
# Auto-detects whether you're ON EC2 or remote (Mac/Linux).
#   On EC2:    runs everything locally (no SSH needed)
#   Remote:    SSHs into EC2 to run commands
#
# Usage:
#   bash aws/ec2-go.sh                  # Pull latest code + restart containers
#   bash aws/ec2-go.sh --build          # Pull + rebuild Docker images
#   bash aws/ec2-go.sh --secrets        # Re-pull SSM secrets + restart
#   bash aws/ec2-go.sh --full           # Full: secrets + build + restart
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "\n${CYAN}=== $* ===${NC}"; }

# ── Parse args ────────────────────────────────────────────────────────────────
COMPOSE_FILE="docker-compose.aws.yml"
APP_DIR="/app"
DO_BUILD=false
DO_SECRETS=false

for arg in "$@"; do
    case "$arg" in
        --build)   DO_BUILD=true ;;
        --secrets) DO_SECRETS=true ;;
        --full)    DO_BUILD=true; DO_SECRETS=true ;;
        --help|-h)
            echo "Usage: ec2-go.sh [--build] [--secrets] [--full]"
            echo "  --build    Rebuild Docker images"
            echo "  --secrets  Re-pull secrets from SSM to .env and keys.json"
            echo "  --full     Both --build and --secrets"
            exit 0 ;;
        *) warn "Unknown arg: $arg" ;;
    esac
done

# ── Detect: are we ON EC2 or remote? ─────────────────────────────────────────
# Check 3 ways: IMDSv2 (token-based), IMDSv1, or hostname pattern ip-*
IS_EC2=false
IMDS_TOKEN=$(curl -sf -m 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
if [[ -n "$IMDS_TOKEN" ]]; then
    # IMDSv2 works
    IS_EC2=true
elif curl -sf -m 2 http://169.254.169.254/latest/meta-data/instance-id >/dev/null 2>&1; then
    # IMDSv1 fallback
    IS_EC2=true
elif hostname | grep -q '^ip-'; then
    # EC2 default hostname pattern (ip-10-0-1-107 etc.)
    IS_EC2=true
fi

if $IS_EC2; then
    info "Detected: running ON EC2 — executing locally"
    # run_cmd just runs the command directly
    run_cmd() { bash -c "$1"; }
else
    info "Detected: running remotely — will SSH into EC2"
    EC2_IP="${EC2_PUBLIC_IP:?Set EC2_PUBLIC_IP in .env or environment}"
    EC2_KEY="${EC2_KEY_FILE:-$HOME/.ssh/mindcraft-ec2.pem}"
    EC2_USER="ubuntu"

    if [[ ! -f "$EC2_KEY" ]]; then
        error "SSH key not found: ${EC2_KEY}
  Set EC2_KEY_FILE or copy your .pem to ~/.ssh/mindcraft-ec2.pem
  Or run this script directly on EC2 (it auto-detects)."
    fi

    SSH_OPTS="-i ${EC2_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
    SSH_CMD="ssh ${SSH_OPTS} ${EC2_USER}@${EC2_IP}"

    # Test SSH
    if ! $SSH_CMD "echo ok" >/dev/null 2>&1; then
        error "Cannot SSH to ${EC2_IP}. Is the instance running?"
    fi
    info "SSH connected to ${EC2_IP}"

    # run_cmd sends the command over SSH
    run_cmd() { $SSH_CMD bash -c "$1"; }
fi

# ── Step 1: Git pull ─────────────────────────────────────────────────────────
step "1/4 Git Pull"
run_cmd '
cd /app
if [ -d .git ]; then
    git fetch origin main 2>&1 || echo "[WARN] git fetch failed — using local files"
    git reset --hard origin/main 2>&1 || echo "[WARN] git reset failed"
    echo "[OK] Code updated from origin/main"
else
    echo "[WARN] /app is not a git repo — skipping pull"
fi
'

# ── Step 2: Re-pull secrets from SSM (optional) ──────────────────────────────
if $DO_SECRETS; then
    step "2/4 Pull Secrets from SSM"
    run_cmd '
cd /app
TOKEN=$(curl -sf -m 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
    REGION=$(curl -sf -m 5 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
else
    REGION=$(curl -sf -m 5 http://169.254.169.254/latest/meta-data/placement/region)
fi
if [ -z "$REGION" ]; then REGION="us-east-1"; echo "[WARN] Metadata unavailable, defaulting to us-east-1"; fi

get_param() {
    aws ssm get-parameter \
        --region "$REGION" \
        --name "/mindcraft/$1" \
        --with-decryption \
        --query "Parameter.Value" \
        --output text 2>/dev/null || echo ""
}

echo "Pulling secrets from SSM /mindcraft/*..."
GEMINI_API_KEY=$(get_param GEMINI_API_KEY)
XAI_API_KEY=$(get_param XAI_API_KEY)
ANTHROPIC_API_KEY=$(get_param ANTHROPIC_API_KEY)
DISCORD_BOT_TOKEN=$(get_param DISCORD_BOT_TOKEN)
BOT_DM_CHANNEL=$(get_param BOT_DM_CHANNEL)
BACKUP_CHAT_CHANNEL=$(get_param BACKUP_CHAT_CHANNEL)
DISCORD_ADMIN_IDS=$(get_param DISCORD_ADMIN_IDS)
TAILSCALE_AUTHKEY=$(get_param TAILSCALE_AUTHKEY)
LITELLM_MASTER_KEY=$(get_param LITELLM_MASTER_KEY)
EC2_PUBLIC_IP=$(get_param EC2_PUBLIC_IP)
GITHUB_TOKEN=$(get_param GITHUB_TOKEN)

# Strip embedded newlines from SSM values — a multiline value would break
# the .env file format and could inject extra key=value pairs.
strip_nl() { printf '%s' "$1" | tr -d '\n\r'; }
GEMINI_API_KEY=$(strip_nl "$GEMINI_API_KEY")
XAI_API_KEY=$(strip_nl "$XAI_API_KEY")
ANTHROPIC_API_KEY=$(strip_nl "$ANTHROPIC_API_KEY")
DISCORD_BOT_TOKEN=$(strip_nl "$DISCORD_BOT_TOKEN")
BOT_DM_CHANNEL=$(strip_nl "$BOT_DM_CHANNEL")
BACKUP_CHAT_CHANNEL=$(strip_nl "$BACKUP_CHAT_CHANNEL")
DISCORD_ADMIN_IDS=$(strip_nl "$DISCORD_ADMIN_IDS")
TAILSCALE_AUTHKEY=$(strip_nl "$TAILSCALE_AUTHKEY")
LITELLM_MASTER_KEY=$(strip_nl "$LITELLM_MASTER_KEY")
EC2_PUBLIC_IP=$(strip_nl "$EC2_PUBLIC_IP")
GITHUB_TOKEN=$(strip_nl "$GITHUB_TOKEN")

cat > /app/keys.json <<KEYS
{
    "OPENAI_API_KEY": "",
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

cat > /app/.env <<ENV
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
BOT_DM_CHANNEL=${BOT_DM_CHANNEL}
BACKUP_CHAT_CHANNEL=${BACKUP_CHAT_CHANNEL}
DISCORD_ADMIN_IDS=${DISCORD_ADMIN_IDS}
GEMINI_API_KEY=${GEMINI_API_KEY}
XAI_API_KEY=${XAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
TAILSCALE_AUTHKEY=${TAILSCALE_AUTHKEY}
LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
EC2_PUBLIC_IP=${EC2_PUBLIC_IP}
GITHUB_TOKEN=${GITHUB_TOKEN}
ENV
chmod 600 /app/.env
echo "[OK] keys.json and .env written from SSM"
'
else
    step "2/4 Secrets (skipped — use --secrets to refresh)"
fi

# ── Step 3: Docker compose up ─────────────────────────────────────────────────
step "3/4 Docker Compose"
BUILD_FLAG=""
if $DO_BUILD; then
    BUILD_FLAG="--build"
    info "Rebuilding Docker images..."
fi

run_cmd "cd /app && docker compose -f ${COMPOSE_FILE} up -d --force-recreate ${BUILD_FLAG} 2>&1 && echo '' && docker compose -f ${COMPOSE_FILE} ps"

# ── Step 4: Verify bots ──────────────────────────────────────────────────────
step "4/4 Bot Verification"
info "Waiting 15s for bots to connect..."
sleep 15

run_cmd '
cd /app
LOGS=$(docker compose -f docker-compose.aws.yml logs --tail 30 mindcraft 2>&1)
for bot in "CloudGrok" "LocalAndy"; do
    if echo "$LOGS" | grep -q "$bot"; then
        echo "[OK] $bot appears in logs"
    else
        echo "[WARN] $bot not found in recent logs (may still be starting)"
    fi
done
echo ""
echo "=== Recent logs ==="
echo "$LOGS" | tail -15
'

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
if $IS_EC2; then
    TOKEN=$(curl -sf -m 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
    if [[ -n "$TOKEN" ]]; then
        EC2_IP=$(curl -sf -m 2 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "this-host")
    else
        EC2_IP=$(curl -sf -m 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "this-host")
    fi
fi
echo "  Minecraft:  ${EC2_IP:-localhost}:19565"
echo "  MindServer: http://${EC2_IP:-localhost}:8080"
echo "  Grafana:    http://${EC2_IP:-localhost}:3004"
echo ""
echo "  Logs: docker compose -f /app/docker-compose.aws.yml logs -f mindcraft"
echo ""
