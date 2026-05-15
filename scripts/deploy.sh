#!/bin/bash
set -e

echo "========================================="
echo "  Back-Tinkuy-Saludable Deployment"
echo "========================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo "[1/5] Checking environment file..."
if [ ! -f .env.production ]; then
    echo "WARNING: .env.production not found!"
    echo "Please copy .env.production.example to .env.production and configure it."
    echo "Aborting deployment."
    exit 1
fi

echo "[2/5] Building Docker containers..."
docker compose -f docker-compose.production.yml build

echo "[3/5] Starting services..."
docker compose -f docker-compose.production.yml up -d

echo "[4/5] Waiting for database to be ready..."
sleep 5

echo "[5/5] Running database migrations..."
docker compose -f docker-compose.production.yml exec -T app npx prisma migrate deploy

echo ""
echo "========================================="
echo "  Deployment Status"
echo "========================================="
docker compose -f docker-compose.production.yml ps

echo ""
echo "Services are starting. Check logs with:"
echo "  docker compose -f docker-compose.production.yml logs -f"
