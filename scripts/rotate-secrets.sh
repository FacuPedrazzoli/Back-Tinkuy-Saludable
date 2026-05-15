#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-.env}"
BACKUP_DIR="${SCRIPT_DIR}/../.secret-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "Secret Rotation Script for Tinkuy"
echo "=========================================="
echo ""

generate_secret() {
    head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 64
}

rotate_env_var() {
    local var_name="$1"
    local new_secret=$(generate_secret)

    if [ -f "$ENV_FILE" ]; then
        if grep -q "^${var_name}=" "$ENV_FILE"; then
            local old_secret=$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2-)
            echo "[$TIMESTAMP] $var_name: rotating..." >> "$BACKUP_DIR/rotation.log"
            sed -i "s|^${var_name}=.*|${var_name}=${new_secret}|" "$ENV_FILE"
            echo "[$TIMESTAMP] $var_name: rotated. Old secret backed up." >> "$BACKUP_DIR/rotation.log"
            echo "  [OLD] ${var_name}=${old_secret:0:8}..." >> "$BACKUP_DIR/rotation.log"
        else
            echo "[WARNING] $var_name not found in $ENV_FILE, skipping"
        fi
    else
        echo "[ERROR] $ENV_FILE not found"
        exit 1
    fi
}

echo "[1/4] Backing up current .env file..."
cp "$ENV_FILE" "$BACKUP_DIR/.env.backup_${TIMESTAMP}"
echo "  Backup created at $BACKUP_DIR/.env.backup_${TIMESTAMP}"

echo ""
echo "[2/4] Generating new secrets..."

echo "  Generating JWT_ADMIN_SECRET..."
rotate_env_var "JWT_ADMIN_SECRET"

echo "  Generating JWT_CUSTOMER_SECRET..."
rotate_env_var "JWT_CUSTOMER_SECRET"

echo "  Generating MP_ACCESS_TOKEN..."
rotate_env_var "MP_ACCESS_TOKEN"

echo "  Generating MP_WEBHOOK_SECRET..."
rotate_env_var "MP_WEBHOOK_SECRET"

echo ""
echo "[3/4] Checking for additional secrets to rotate..."
ADDITIONAL_SECRETS=(
    "COOKIE_SECRET"
    "REDIS_PASSWORD"
    "DATABASE_URL"
)

for secret in "${ADDITIONAL_SECRETS[@]}"; do
    if grep -q "^${secret}=" "$ENV_FILE" 2>/dev/null; then
        read -p "  Rotate $secret? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rotate_env_var "$secret"
        fi
    fi
done

echo ""
echo "[4/4] Generating migration instructions..."

cat > "$BACKUP_DIR/MIGRATION_${TIMESTAMP}.md" << EOF
# Secret Rotation Instructions
Timestamp: $TIMESTAMP

## Secrets Rotated

1. JWT_ADMIN_SECRET
2. JWT_CUSTOMER_SECRET
3. MP_ACCESS_TOKEN
4. MP_WEBHOOK_SECRET

## Required Actions

### 1. JWT Tokens
All existing JWT tokens are now INVALID. Users will need to re-login.

### 2. MercadoPago
If MP_ACCESS_TOKEN was rotated:
- Update the token in your MercadoPago dashboard
- Ensure webhook URLs are still configured

### 3. Deploy
After rotating secrets, you MUST:

\`\`\`bash
# Rebuild and redeploy
npm run build
npm run start
\`\`\`

### 4. Verify
Check application logs after deployment for any authentication errors.

## Rollback (if needed)

To rollback to the previous state:
\`\`\`bash
cp $BACKUP_DIR/.env.backup_${TIMESTAMP} $ENV_FILE
\`\`\`

Then restart the application.

## Log
Full rotation log available at: $BACKUP_DIR/rotation.log
EOF

echo "  Migration instructions created at $BACKUP_DIR/MIGRATION_${TIMESTAMP}.md"

echo ""
echo "=========================================="
echo "Secret rotation completed successfully!"
echo "=========================================="
echo ""
echo "IMPORTANT:"
echo "  1. Review $BACKUP_DIR/MIGRATION_${TIMESTAMP}.md"
echo "  2. Deploy the updated .env file"
echo "  3. Monitor logs for authentication errors"
echo "  4. Users may need to re-login"
echo ""
