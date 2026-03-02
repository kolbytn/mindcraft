#!/usr/bin/env bash
# =============================================================================
# aws/teardown.sh — Destroy all Mindcraft AWS infrastructure
# =============================================================================
# Run from WSL: bash aws/teardown.sh
# Deletes: EC2, IAM role/policy/profile, security group, VPC, S3 bucket (optional)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[TEARDOWN]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Load config ───────────────────────────────────────────────────────────────
[[ -f "$CONFIG_FILE" ]] || error "config.env not found."
# shellcheck source=/dev/null
source "$CONFIG_FILE"

echo ""
echo -e "${RED}============================================================${NC}"
echo -e "${RED}  WARNING: This will PERMANENTLY DESTROY:${NC}"
echo -e "${RED}  - EC2 instance (${INSTANCE_ID:-?}) and its root volume${NC}"
echo -e "${RED}  - Security group, VPC, subnets, IGW${NC}"
echo -e "${RED}  - IAM role and instance profile${NC}"
echo -e "${RED}  - EC2 SSH key pair${NC}"
echo -e "${RED}  - SSM parameters at /mindcraft/*${NC}"
echo -e "${RED}============================================================${NC}"
echo ""

# S3 bucket deletion is opt-in (data loss!)
read -r -p "Also DELETE the S3 bucket and ALL backups? [y/N] " DELETE_S3
echo ""
read -r -p "Type 'destroy' to confirm teardown: " CONFIRM
[[ "$CONFIRM" == "destroy" ]] || { echo "Aborted."; exit 0; }
echo ""

# ── Terminate EC2 ─────────────────────────────────────────────────────────────
if [[ -n "${INSTANCE_ID:-}" ]]; then
  info "Terminating EC2 instance: ${INSTANCE_ID}..."
  aws ec2 terminate-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null || warn "Could not terminate instance (may not exist)"
  info "Waiting for termination..."
  aws ec2 wait instance-terminated --region "$REGION" --instance-ids "$INSTANCE_ID" 2>/dev/null || true
fi

# ── Delete key pair ───────────────────────────────────────────────────────────
if [[ -n "${KEY_NAME:-}" ]]; then
  info "Deleting key pair: ${KEY_NAME}..."
  aws ec2 delete-key-pair --region "$REGION" --key-name "$KEY_NAME" 2>/dev/null || warn "Key pair not found"
fi

# ── Delete IAM ────────────────────────────────────────────────────────────────
if [[ -n "${INSTANCE_PROFILE_NAME:-}" ]]; then
  info "Removing IAM instance profile: ${INSTANCE_PROFILE_NAME}..."
  aws iam remove-role-from-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE_NAME" \
    --role-name "${ROLE_NAME}" 2>/dev/null || true
  aws iam delete-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE_NAME" 2>/dev/null || warn "Instance profile not found"
fi

if [[ -n "${ROLE_NAME:-}" ]]; then
  info "Deleting IAM role: ${ROLE_NAME}..."
  # Delete inline policies first
  POLICIES=$(aws iam list-role-policies --role-name "$ROLE_NAME" --query 'PolicyNames' --output text 2>/dev/null || echo "")
  for p in $POLICIES; do
    aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$p" 2>/dev/null || true
  done
  aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || warn "Role not found"
fi

# ── Delete SSM parameters ─────────────────────────────────────────────────────
info "Deleting SSM parameters at /mindcraft/..."
PARAMS=$(aws ssm describe-parameters \
  --region "$REGION" \
  --parameter-filters "Key=Path,Values=/mindcraft" \
  --query 'Parameters[].Name' \
  --output text 2>/dev/null || echo "")
for p in $PARAMS; do
  aws ssm delete-parameter --region "$REGION" --name "$p" 2>/dev/null || true
  info "  Deleted ${p}"
done

# ── Delete security group ─────────────────────────────────────────────────────
if [[ -n "${SG_ID:-}" ]]; then
  info "Deleting security group: ${SG_ID}..."
  # Wait a moment for EC2 to fully detach
  sleep 10
  aws ec2 delete-security-group --region "$REGION" --group-id "$SG_ID" 2>/dev/null || warn "SG not found or still in use"
fi

# ── Delete VPC components ─────────────────────────────────────────────────────
if [[ -n "${SUBNET_ID:-}" ]]; then
  info "Deleting subnet: ${SUBNET_ID}..."
  aws ec2 delete-subnet --region "$REGION" --subnet-id "$SUBNET_ID" 2>/dev/null || warn "Subnet not found"
fi

if [[ -n "${IGW_ID:-}" && -n "${VPC_ID:-}" ]]; then
  info "Detaching and deleting IGW: ${IGW_ID}..."
  aws ec2 detach-internet-gateway --region "$REGION" --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" 2>/dev/null || true
  aws ec2 delete-internet-gateway --region "$REGION" --internet-gateway-id "$IGW_ID" 2>/dev/null || warn "IGW not found"
fi

if [[ -n "${VPC_ID:-}" ]]; then
  # Delete route tables (non-main)
  RTB_IDS=$(aws ec2 describe-route-tables \
    --region "$REGION" \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --query 'RouteTables[?Associations[0].Main!=`true`].RouteTableId' \
    --output text 2>/dev/null || echo "")
  for rtb in $RTB_IDS; do
    aws ec2 delete-route-table --region "$REGION" --route-table-id "$rtb" 2>/dev/null || true
  done

  info "Deleting VPC: ${VPC_ID}..."
  aws ec2 delete-vpc --region "$REGION" --vpc-id "$VPC_ID" 2>/dev/null || warn "VPC not found or has dependencies"
fi

# ── S3 bucket (optional) ──────────────────────────────────────────────────────
if [[ "${DELETE_S3,,}" == "y" && -n "${BUCKET_NAME:-}" ]]; then
  warn "Deleting S3 bucket and ALL contents: ${BUCKET_NAME}..."
  # Remove all versions and delete markers first
  aws s3api delete-objects \
    --bucket "$BUCKET_NAME" \
    --delete "$(aws s3api list-object-versions \
      --bucket "$BUCKET_NAME" \
      --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
      --output json 2>/dev/null)" >/dev/null 2>&1 || true
  aws s3 rm "s3://${BUCKET_NAME}" --recursive 2>/dev/null || true
  aws s3api delete-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null || warn "Bucket not found"
  info "S3 bucket deleted."
else
  info "S3 bucket preserved: ${BUCKET_NAME} (your backups are safe)"
fi

# ── Clean up local config ─────────────────────────────────────────────────────
if [[ -f "$CONFIG_FILE" ]]; then
  rm -f "$CONFIG_FILE"
  info "Removed config.env"
fi
if [[ -f "${SCRIPT_DIR}/mindcraft-ec2.pem" ]]; then
  rm -f "${SCRIPT_DIR}/mindcraft-ec2.pem"
  info "Removed mindcraft-ec2.pem"
fi

echo ""
echo -e "${GREEN}Teardown complete.${NC}"
