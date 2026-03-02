#!/usr/bin/env bash
# =============================================================================
# aws/ec2-deploy.sh — Bootstrap / Update Mindcraft directly on EC2
# =============================================================================
# Run this INSIDE the EC2 instance (browser SSH / EC2 Instance Connect).
# Handles first-time clone OR subsequent git pull, then starts containers.
#
# Usage:
#   GITHUB_TOKEN=ghp_xxxx bash /tmp/ec2-deploy.sh
#   # or, if already at /app:
#   GITHUB_TOKEN=ghp_xxxx bash /app/aws/ec2-deploy.sh
#
# The GITHUB_TOKEN needs repo read access (classic PAT or fine-grained).
# =============================================================================
set -euo pipefail

REPO_HTTPS="https://github.com/Z0mb13V1/mindcraft-0.1.3.git"
APP_DIR="/app"
COMPOSE_FILE="docker-compose.aws.yml"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "\n${CYAN}=== $* ===${NC}"; }

# ── Require token ──────────────────────────────────────────────────────────────
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    echo ""
    echo "  No GITHUB_TOKEN set. The repo is private — a token is required."
    echo "  Create one at: https://github.com/settings/tokens"
    echo "  (needs 'repo' read scope)"
    echo ""
    read -rsp "  Paste your GitHub Personal Access Token: " GITHUB_TOKEN
    echo ""
    [[ -n "$GITHUB_TOKEN" ]] || error "Token is required."
fi

CLONE_URL="https://${GITHUB_TOKEN}@github.com/Z0mb13V1/mindcraft-0.1.3.git"

# ── Detect region from IMDS ────────────────────────────────────────────────────
IMDS_TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || echo "")
if [[ -n "$IMDS_TOKEN" ]]; then
    REGION=$(curl -s -H "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" \
        "http://169.254.169.254/latest/meta-data/placement/region" 2>/dev/null \
        || echo "$REGION")
fi
info "Region: ${REGION}"

# ── SSM helper ────────────────────────────────────────────────────────────────
get_param() {
    aws ssm get-parameter \
        --region "$REGION" \
        --name "/mindcraft/$1" \
        --with-decryption \
        --query 'Parameter.Value' \
        --output text 2>/dev/null || echo ""
}

# ── Step 1: Clone or update ────────────────────────────────────────────────────
step "1. Sync code"
if [[ -d "${APP_DIR}/.git" ]]; then
    info "Repo already at ${APP_DIR} — pulling latest..."
    cd "$APP_DIR"
    git remote set-url origin "$CLONE_URL"
    git fetch origin
    git reset --hard origin/main
    git clean -fd --exclude=chromadb-data/ 2>/dev/null || true
    info "Updated to: $(git log --oneline -1)"
elif [[ -d "${APP_DIR}" ]]; then
    # Dir exists but no .git — init in-place and pull
    info "${APP_DIR} exists but has no git repo — initialising in-place..."
    cd "$APP_DIR"
    git init -b main
    git remote add origin "$CLONE_URL"
    git fetch origin main
    git reset --hard origin/main
    info "Initialised: $(git log --oneline -1)"
else
    info "Cloning repo to ${APP_DIR}..."
    git clone "$CLONE_URL" "$APP_DIR"
    cd "$APP_DIR"
    info "Cloned: $(git log --oneline -1)"
fi

# Secure the git remote URL so the token isn't visible in git log output
git remote set-url origin "$REPO_HTTPS"

# ── Step 2: Pull secrets from SSM → keys.json ─────────────────────────────────
step "2. Pull secrets from SSM"

GEMINI_API_KEY=$(get_param GEMINI_API_KEY)
XAI_API_KEY=$(get_param XAI_API_KEY)
ANTHROPIC_API_KEY=$(get_param ANTHROPIC_API_KEY)
DISCORD_BOT_TOKEN=$(get_param DISCORD_BOT_TOKEN)

if [[ -z "$GEMINI_API_KEY" && -z "$XAI_API_KEY" ]]; then
    warn "SSM returned empty keys — either IAM role lacks access or params not set."
    warn "Continuing anyway; containers may fail if keys are missing."
fi

cat > "${APP_DIR}/keys.json" <<KEYS
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
chmod 600 "${APP_DIR}/keys.json"
info "keys.json written."

# ── Step 3: Write .env ────────────────────────────────────────────────────────
step "3. Write .env"

BOT_DM_CHANNEL=$(get_param BOT_DM_CHANNEL)
BACKUP_CHAT_CHANNEL=$(get_param BACKUP_CHAT_CHANNEL)
S3_BUCKET=$(get_param S3_BUCKET)
DISCORD_ADMIN_IDS=$(get_param DISCORD_ADMIN_IDS)
TAILSCALE_AUTHKEY=$(get_param TAILSCALE_AUTHKEY)
LITELLM_MASTER_KEY=$(get_param LITELLM_MASTER_KEY)
VLLM_BASE_URL=$(get_param VLLM_BASE_URL)

cat > "${APP_DIR}/.env" <<ENV
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
BOT_DM_CHANNEL=${BOT_DM_CHANNEL}
BACKUP_CHAT_CHANNEL=${BACKUP_CHAT_CHANNEL}
S3_BUCKET=${S3_BUCKET}
DISCORD_ADMIN_IDS=${DISCORD_ADMIN_IDS}
GEMINI_API_KEY=${GEMINI_API_KEY}
XAI_API_KEY=${XAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
TAILSCALE_AUTHKEY=${TAILSCALE_AUTHKEY}
LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
VLLM_BASE_URL=${VLLM_BASE_URL}
ENV
chmod 600 "${APP_DIR}/.env"
info ".env written."

# ── Step 4: Ollama proxy (Tailscale → local GPU) ─────────────────────────────
step "4. Set up Ollama proxy"
if [[ -f "${APP_DIR}/aws/setup-ollama-proxy.sh" ]]; then
    bash "${APP_DIR}/aws/setup-ollama-proxy.sh" || warn "Ollama proxy setup had issues (non-fatal)."
else
    warn "setup-ollama-proxy.sh not found — skipping."
fi

# ── Step 5: Start containers ──────────────────────────────────────────────────
step "5. Start containers"
cd "$APP_DIR"

# Install npm deps into a named volume if node_modules doesn't exist yet
if [[ ! -d node_modules ]]; then
    info "Installing npm dependencies (first run)..."
    docker run --rm \
        -v "${APP_DIR}":/app \
        -w /app \
        node:22-slim \
        npm install --omit=dev --legacy-peer-deps
fi

docker compose -f "$COMPOSE_FILE" pull --ignore-pull-failures 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" up -d --build

# ── Step 6: Install backup cron ───────────────────────────────────────────────
step "6. Install backup cron"
if [[ -f "${APP_DIR}/aws-cron.tab" ]]; then
    crontab "${APP_DIR}/aws-cron.tab" 2>/dev/null \
        || sudo crontab -u ubuntu "${APP_DIR}/aws-cron.tab" 2>/dev/null \
        || warn "Could not install cron (not critical)."
    info "Backup cron installed."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""
EC2_IP=$(curl -s -H "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" \
    "http://169.254.169.254/latest/meta-data/public-ipv4" 2>/dev/null \
    || echo "<ec2-ip>")
echo "  Minecraft:  ${EC2_IP}:19565"
echo "  Grafana:    http://${EC2_IP}:3004"
echo "  MindServer: http://${EC2_IP}:8080"
echo ""
echo "  Logs: docker compose -f /app/${COMPOSE_FILE} logs -f"
echo ""
