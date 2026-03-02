#!/usr/bin/env bash
# =============================================================================
# aws/user-data.sh — EC2 First-Boot Bootstrap Script
# =============================================================================
# Runs as root on first boot via EC2 user-data.
# Installs Docker, Docker Compose plugin, AWS CLI v2.
# The actual app deployment is handled by aws/deploy.sh from your local machine.
# =============================================================================
set -euo pipefail
exec > /var/log/user-data.log 2>&1

echo "=== Mindcraft EC2 Bootstrap: $(date) ==="

# ── System update ─────────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  unzip \
  htop \
  git \
  jq \
  cron

# ── Docker ────────────────────────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

# Allow ubuntu user to run docker without sudo
usermod -aG docker ubuntu

# ── AWS CLI v2 ────────────────────────────────────────────────────────────────
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/aws /tmp/awscliv2.zip

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p /app
chown ubuntu:ubuntu /app

# ── Cron: backup every 6 hours ────────────────────────────────────────────────
# The actual backup script is deployed by aws/deploy.sh
# Cron job added after deploy.sh runs for the first time via:
#   sudo crontab -u ubuntu /app/aws/cron.tab
# Placeholder created here so the file exists
cat > /app/aws-cron.tab <<'CRON'
# Mindcraft world backup — every 6 hours
0 */6 * * * /app/aws/backup.sh >> /var/log/mindcraft-backup.log 2>&1
CRON
chown ubuntu:ubuntu /app/aws-cron.tab

# ── Ready marker ──────────────────────────────────────────────────────────────
touch /var/lib/cloud/instance/mindcraft-bootstrap-done
echo "=== Bootstrap complete: $(date) ==="
echo "Waiting for aws/deploy.sh to push application files..."
