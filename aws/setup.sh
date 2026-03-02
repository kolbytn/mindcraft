#!/usr/bin/env bash
# =============================================================================
# aws/setup.sh — Mindcraft AWS Infrastructure Setup
# =============================================================================
# Creates: VPC, Security Group, S3 bucket, IAM role, SSM parameters, EC2 instance
# Run once from WSL: bash aws/setup.sh
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REGION="${AWS_REGION:-us-east-1}"
INSTANCE_TYPE="t3.large"
AMI_NAME_FILTER="ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
KEY_NAME="mindcraft-ec2"
KEY_FILE="$(dirname "$0")/mindcraft-ec2.pem"
CONFIG_FILE="$(dirname "$0")/config.env"
APP_DIR="/app"
STACK_NAME="mindcraft"
# S3 bucket name must be globally unique; we append account ID
BUCKET_PREFIX="mindcraft-world-backups"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."

command -v aws  >/dev/null 2>&1 || error "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html
  Quick install:
    curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o /tmp/awscliv2.zip
    unzip /tmp/awscliv2.zip -d /tmp
    sudo /tmp/aws/install"

command -v jq   >/dev/null 2>&1 || error "jq not found. Install: sudo apt-get install -y jq"
command -v ssh  >/dev/null 2>&1 || error "ssh not found."

# Verify credentials
CALLER=$(aws sts get-caller-identity 2>/dev/null) \
  || error "AWS credentials not configured. Run: aws configure
  You'll need:
    - AWS Access Key ID     (from IAM → Security credentials)
    - AWS Secret Access Key (same page)
    - Default region:       ${REGION}
    - Output format:        json"

ACCOUNT_ID=$(echo "$CALLER" | jq -r '.Account')
CALLER_ARN=$(echo "$CALLER" | jq -r '.Arn')
BUCKET_NAME="${BUCKET_PREFIX}-${ACCOUNT_ID}"

info "AWS account: ${ACCOUNT_ID}"
info "Caller ARN:  ${CALLER_ARN}"
info "Region:      ${REGION}"
info "S3 bucket:   ${BUCKET_NAME}"

# ── Tyler's IP for SSH/admin access ──────────────────────────────────────────
DETECTED_IP=$(curl -s https://checkip.amazonaws.com 2>/dev/null || curl -s https://api.ipify.org 2>/dev/null || echo "")

if [[ -n "$DETECTED_IP" ]]; then
  echo ""
  read -r -p "Your current IP appears to be ${DETECTED_IP}. Use this to restrict admin ports? [Y/n] " USE_DETECTED
  if [[ "${USE_DETECTED,,}" != "n" ]]; then
    ADMIN_IP="${DETECTED_IP}"
  else
    read -r -p "Enter your IP address (for SSH/Grafana/UI access): " ADMIN_IP
  fi
else
  read -r -p "Enter your IP address (for SSH/Grafana/UI access): " ADMIN_IP
fi

ADMIN_CIDR="${ADMIN_IP}/32"
info "Admin CIDR: ${ADMIN_CIDR}"

# ── SSM Secrets collection ────────────────────────────────────────────────────
echo ""
info "Collecting secrets for SSM Parameter Store (stored encrypted, never in git)..."
echo "  Press Enter to skip any key you don't use."

collect_secret() {
  local name="$1" prompt="$2"
  local input="" char
  printf "  %s: " "$prompt" > /dev/tty
  while IFS= read -r -s -n1 char < /dev/tty; do
    if [[ -z "$char" ]]; then          # Enter
      break
    elif [[ "$char" == $'\177' ]] || [[ "$char" == $'\b' ]]; then  # Backspace
      if [[ -n "$input" ]]; then
        input="${input%?}"
        printf '\b \b' > /dev/tty
      fi
    else
      input+="$char"
      printf '*' > /dev/tty           # Show * per character (not captured by $())
    fi
  done
  printf '\n' > /dev/tty
  printf '%s' "$input"
}

GEMINI_API_KEY=$(collect_secret "GEMINI_API_KEY"   "GEMINI_API_KEY")
XAI_API_KEY=$(collect_secret    "XAI_API_KEY"      "XAI_API_KEY (also used as OPENAI_API_KEY)")
ANTHROPIC_API_KEY=$(collect_secret "ANTHROPIC_API_KEY" "ANTHROPIC_API_KEY")
DISCORD_BOT_TOKEN=$(collect_secret "DISCORD_BOT_TOKEN" "DISCORD_BOT_TOKEN")
BOT_DM_CHANNEL=$(collect_secret    "BOT_DM_CHANNEL"    "BOT_DM_CHANNEL (Discord channel ID)")
BACKUP_CHAT_CHANNEL=$(collect_secret "BACKUP_CHAT_CHANNEL" "BACKUP_CHAT_CHANNEL (Discord channel ID)")

echo ""

# =============================================================================
# 1. VPC
# =============================================================================
info "Creating VPC..."
VPC_ID=$(aws ec2 create-vpc \
  --region "$REGION" \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${STACK_NAME}-vpc}]" \
  --query 'Vpc.VpcId' --output text)
aws ec2 modify-vpc-attribute --region "$REGION" --vpc-id "$VPC_ID" --enable-dns-support
aws ec2 modify-vpc-attribute --region "$REGION" --vpc-id "$VPC_ID" --enable-dns-hostnames
info "VPC: ${VPC_ID}"

# Subnet
SUBNET_ID=$(aws ec2 create-subnet \
  --region "$REGION" \
  --vpc-id "$VPC_ID" \
  --cidr-block 10.0.1.0/24 \
  --availability-zone "${REGION}a" \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${STACK_NAME}-subnet}]" \
  --query 'Subnet.SubnetId' --output text)
aws ec2 modify-subnet-attribute --region "$REGION" --subnet-id "$SUBNET_ID" --map-public-ip-on-launch
info "Subnet: ${SUBNET_ID}"

# Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
  --region "$REGION" \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${STACK_NAME}-igw}]" \
  --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --region "$REGION" --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
info "IGW: ${IGW_ID}"

# Route table
RTB_ID=$(aws ec2 create-route-table \
  --region "$REGION" \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${STACK_NAME}-rtb}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --region "$REGION" --route-table-id "$RTB_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" >/dev/null
aws ec2 associate-route-table --region "$REGION" --route-table-id "$RTB_ID" --subnet-id "$SUBNET_ID" >/dev/null
info "Route table: ${RTB_ID}"

# =============================================================================
# 2. Security Group
# =============================================================================
info "Creating security group..."
SG_ID=$(aws ec2 create-security-group \
  --region "$REGION" \
  --group-name "${STACK_NAME}-sg" \
  --description "Mindcraft server security group" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

# Minecraft — open to world (players connect)
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=19565,ToPort=19565,IpRanges=[{CidrIp=0.0.0.0/0,Description='Minecraft'}]" >/dev/null

# Admin ports — Tyler's IP only
for PORT_DESC in "22:SSH" "3004:Grafana" "8080:MindServerUI" "9090:Prometheus"; do
  PORT="${PORT_DESC%%:*}"; DESC="${PORT_DESC##*:}"
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=${PORT},ToPort=${PORT},IpRanges=[{CidrIp=${ADMIN_CIDR},Description='${DESC} - Tyler only'}]" >/dev/null
done

# All outbound (for LLM API calls)
aws ec2 authorize-security-group-egress --region "$REGION" --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]" 2>/dev/null || true

aws ec2 create-tags --region "$REGION" --resources "$SG_ID" \
  --tags "Key=Name,Value=${STACK_NAME}-sg"
info "Security group: ${SG_ID}"

# =============================================================================
# 3. S3 Bucket
# =============================================================================
info "Creating S3 bucket: ${BUCKET_NAME}..."

# Create bucket (us-east-1 doesn't use --create-bucket-configuration)
if [[ "$REGION" == "us-east-1" ]]; then
  aws s3api create-bucket --region "$REGION" --bucket "$BUCKET_NAME" >/dev/null
else
  aws s3api create-bucket --region "$REGION" --bucket "$BUCKET_NAME" \
    --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
fi

# Block ALL public access
aws s3api put-public-access-block --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Versioning ON
aws s3api put-bucket-versioning --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

# SSE-S3 encryption (AES-256)
aws s3api put-bucket-encryption --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
      "BucketKeyEnabled": true
    }]
  }'

# Lifecycle: keep 30 versions, expire noncurrent after 90 days
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET_NAME" \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "keep-30-versions",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 90},
      "NoncurrentVersionTransitions": [],
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    }]
  }'

info "S3 bucket configured."

# =============================================================================
# 4. IAM Role for EC2
# =============================================================================
info "Creating IAM role: ${STACK_NAME}-ec2-role..."

ROLE_NAME="${STACK_NAME}-ec2-role"
POLICY_NAME="${STACK_NAME}-ec2-policy"
INSTANCE_PROFILE_NAME="${STACK_NAME}-ec2-profile"

# Trust policy
aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --description "Mindcraft EC2 instance role" >/dev/null

# Permissions policy: S3 + SSM
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"S3BucketAccess\",
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\",\"s3:GetBucketLocation\"],
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET_NAME}\",
          \"arn:aws:s3:::${BUCKET_NAME}/*\"
        ]
      },
      {
        \"Sid\": \"SSMParameterAccess\",
        \"Effect\": \"Allow\",
        \"Action\": [\"ssm:GetParameter\",\"ssm:GetParameters\",\"ssm:GetParametersByPath\"],
        \"Resource\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/mindcraft/*\"
      }
    ]
  }"

# Instance profile
aws iam create-instance-profile \
  --instance-profile-name "$INSTANCE_PROFILE_NAME" >/dev/null
aws iam add-role-to-instance-profile \
  --instance-profile-name "$INSTANCE_PROFILE_NAME" \
  --role-name "$ROLE_NAME"

info "IAM role: ${ROLE_ARN}"

# Wait for role to propagate
info "Waiting for IAM role propagation (10s)..."
sleep 10

# =============================================================================
# 5. S3 Bucket Policy (EC2 role + Tyler IAM only)
# =============================================================================
info "Applying S3 bucket policy..."
aws s3api put-bucket-policy --bucket "$BUCKET_NAME" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"DenyHTTP\",
        \"Effect\": \"Deny\",
        \"Principal\": \"*\",
        \"Action\": \"s3:*\",
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET_NAME}\",
          \"arn:aws:s3:::${BUCKET_NAME}/*\"
        ],
        \"Condition\": {\"Bool\": {\"aws:SecureTransport\": \"false\"}}
      },
      {
        \"Sid\": \"AllowEC2Role\",
        \"Effect\": \"Allow\",
        \"Principal\": {\"AWS\": \"${ROLE_ARN}\"},
        \"Action\": [\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\",\"s3:GetBucketLocation\"],
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET_NAME}\",
          \"arn:aws:s3:::${BUCKET_NAME}/*\"
        ]
      },
      {
        \"Sid\": \"AllowTylerIAM\",
        \"Effect\": \"Allow\",
        \"Principal\": {\"AWS\": \"${CALLER_ARN}\"},
        \"Action\": \"s3:*\",
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET_NAME}\",
          \"arn:aws:s3:::${BUCKET_NAME}/*\"
        ]
      }
    ]
  }"
info "Bucket policy applied."

# =============================================================================
# 6. SSM Parameters
# =============================================================================
info "Storing secrets in SSM Parameter Store..."

put_param() {
  local name="$1" value="$2"
  if [[ -n "$value" ]]; then
    aws ssm put-parameter --region "$REGION" \
      --name "/mindcraft/${name}" \
      --value "$value" \
      --type SecureString \
      --overwrite >/dev/null
    info "  Stored /mindcraft/${name}"
  else
    warn "  Skipped /mindcraft/${name} (empty)"
  fi
}

put_param "GEMINI_API_KEY"       "$GEMINI_API_KEY"
put_param "XAI_API_KEY"          "$XAI_API_KEY"
put_param "ANTHROPIC_API_KEY"    "$ANTHROPIC_API_KEY"
put_param "DISCORD_BOT_TOKEN"    "$DISCORD_BOT_TOKEN"
put_param "BOT_DM_CHANNEL"       "$BOT_DM_CHANNEL"
put_param "BACKUP_CHAT_CHANNEL"  "$BACKUP_CHAT_CHANNEL"
put_param "S3_BUCKET"            "$BUCKET_NAME"

# =============================================================================
# 7. EC2 Key Pair
# =============================================================================
info "Creating EC2 key pair: ${KEY_NAME}..."

if aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" >/dev/null 2>&1; then
  warn "Key pair '${KEY_NAME}' already exists. Delete it first if you want a new one:"
  warn "  aws ec2 delete-key-pair --region ${REGION} --key-name ${KEY_NAME}"
else
  aws ec2 create-key-pair \
    --region "$REGION" \
    --key-name "$KEY_NAME" \
    --query 'KeyMaterial' \
    --output text > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  info "Private key saved to: ${KEY_FILE}"
fi

# =============================================================================
# 8. EC2 Instance
# =============================================================================
info "Finding latest Ubuntu 24.04 AMI..."
AMI_ID=$(aws ec2 describe-images \
  --region "$REGION" \
  --owners 099720109477 \
  --filters "Name=name,Values=${AMI_NAME_FILTER}" \
             "Name=state,Values=available" \
             "Name=architecture,Values=x86_64" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)
info "AMI: ${AMI_ID}"

info "Launching EC2 instance (${INSTANCE_TYPE})..."
INSTANCE_ID=$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile "Name=${INSTANCE_PROFILE_NAME}" \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --user-data "file://$(dirname "$0")/user-data.sh" \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=${STACK_NAME}-server}]" \
    "ResourceType=volume,Tags=[{Key=Name,Value=${STACK_NAME}-root}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

info "Instance launched: ${INSTANCE_ID}"
info "Waiting for instance to reach running state..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

EC2_IP=$(aws ec2 describe-instances \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

# =============================================================================
# 9. Write config.env
# =============================================================================
cat > "$CONFIG_FILE" <<EOF
# Generated by aws/setup.sh — DO NOT COMMIT
REGION=${REGION}
ACCOUNT_ID=${ACCOUNT_ID}
CALLER_ARN=${CALLER_ARN}
BUCKET_NAME=${BUCKET_NAME}
INSTANCE_ID=${INSTANCE_ID}
EC2_IP=${EC2_IP}
ADMIN_IP=${ADMIN_IP}
VPC_ID=${VPC_ID}
SUBNET_ID=${SUBNET_ID}
IGW_ID=${IGW_ID}
SG_ID=${SG_ID}
ROLE_NAME=${ROLE_NAME}
KEY_FILE=${KEY_FILE}
KEY_NAME=${KEY_NAME}
INSTANCE_PROFILE_NAME=${INSTANCE_PROFILE_NAME}
EOF
chmod 600 "$CONFIG_FILE"
info "Config saved to: ${CONFIG_FILE}"

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  EC2 IP:      ${EC2_IP}"
echo "  Instance ID: ${INSTANCE_ID}"
echo "  S3 Bucket:   ${BUCKET_NAME}"
echo ""
echo "  Next steps:"
echo "  1. Wait ~3 min for EC2 to finish booting (Docker install)"
echo "  2. Run:  bash aws/deploy.sh"
echo "  3. Test: ssh -i ${KEY_FILE} ubuntu@${EC2_IP}"
echo ""
echo "  Minecraft:  ${EC2_IP}:19565"
echo "  Grafana:    http://${EC2_IP}:3004"
echo "  MindServer: http://${EC2_IP}:8080"
echo ""
