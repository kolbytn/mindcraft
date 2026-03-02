# Tasks.Dockerfile — Evaluation / benchmark runner
# Builds a container with Mindcraft + Java 21 + AWS CLI for automated tasks.

FROM node:22-slim AS base

# ── System dependencies (single layer) ──────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      git unzip curl wget ca-certificates gnupg lsb-release \
      python3 python3-pip python3-boto3 python3-tqdm tmux \
      apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

# ── Adoptium Java 21 (proper GPG keyring, not deprecated apt-key) ───────────
RUN mkdir -p /etc/apt/keyrings \
    && wget -qO- https://packages.adoptium.net/artifactory/api/gpg/key/public \
       | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] \
       https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" \
       > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update && apt-get install -y --no-install-recommends temurin-21-jdk \
    && rm -rf /var/lib/apt/lists/*

# ── AWS CLI v2 ──────────────────────────────────────────────────────────────
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscliv2.zip /tmp/aws

# ── Application code ───────────────────────────────────────────────────────
WORKDIR /mindcraft
# Copy source from the build context (this repo) rather than cloning from
# GitHub at build time. A live git clone:
#   1. Breaks reproducibility (upstream HEAD can change between builds)
#   2. Fails in offline/air-gapped CI environments
#   3. Introduces supply-chain risk (external fetch during image build)
COPY . .

COPY ./server_data.zip /mindcraft/
RUN unzip -q server_data.zip && rm server_data.zip

RUN npm ci --omit=dev

# ── Non-root user ──────────────────────────────────────────────────────────
RUN groupadd -r mindcraft && useradd -r -g mindcraft -d /mindcraft mindcraft \
    && chown -R mindcraft:mindcraft /mindcraft
USER mindcraft

VOLUME /data
EXPOSE 8000
