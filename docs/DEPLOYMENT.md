# Deployment Checklist - Back Tinkuy Saludable

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | >= 20.0.0 | Check with `node --version` |
| npm | >= 10.0.0 | Comes with Node.js |
| PostgreSQL | 14+ | Database engine |
| Redis | 6+ | Caching and cart locking |
| Git | Latest | For cloning/pulling code |

## Environment Variables

Create a `.env.production` file with the following variables:

```bash
# ─────────────────────────────────────────────
# Database (Required)
# ─────────────────────────────────────────────
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"

# ─────────────────────────────────────────────
# Redis (Required)
# ─────────────────────────────────────────────
REDIS_URL="redis://USER:PASSWORD@HOST:6379"

# ─────────────────────────────────────────────
# JWT Secrets (Required - Generate strong random strings)
# ─────────────────────────────────────────────
# Generate with: openssl rand -base64 32
JWT_ADMIN_SECRET="your-admin-secret-min-32-chars-long-string"
JWT_CUSTOMER_SECRET="your-customer-secret-min-32-chars-long-string"

# ─────────────────────────────────────────────
# MercadoPago (Required for payments)
# ─────────────────────────────────────────────
# Test tokens from: https://www.mercadopago.com/developers/panel
MP_ACCESS_TOKEN="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
MP_WEBHOOK_SECRET="whsec_your_webhook_secret_from_mercadopago_dashboard"
MP_MODE="production"  # or "test"

# ─────────────────────────────────────────────
# Server Configuration
# ─────────────────────────────────────────────
PORT=4000
NODE_ENV="production"
FRONTEND_URL="https://your-frontend-domain.com"

# ─────────────────────────────────────────────
# Optional: Logging
# ─────────────────────────────────────────────
LOG_LEVEL="info"  # debug, info, warn, error, fatal

# ─────────────────────────────────────────────
# Optional: Proxy (if behind load balancer)
# ─────────────────────────────────────────────
TRUST_PROXY=1  # or number of proxies
```

## Database Setup

### 1. Create PostgreSQL Database

```sql
CREATE DATABASE back_tinkuy;
CREATE USER back_tinkuy_user WITH ENCRYPTED PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE back_tinkuy TO back_tinkuy_user;
\c back_tinkuy
GRANT ALL ON SCHEMA public TO back_tinkuy_user;
```

### 2. Run Migrations

```bash
# Generate Prisma client
npm run db:generate

# Apply migrations (creates tables)
npm run db:migrate

# Optional: Seed with initial data
npm run db:seed
```

### 3. Verify Database Connection

```bash
# Test connection string
psql $DATABASE_URL -c "SELECT 1;"
```

## Redis Setup

### 1. Install Redis (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl enable redis-server
```

### 2. Configure Redis for Production

```bash
# /etc/redis/redis.conf - Key settings to verify
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
requirepass your_redis_password
```

### 3. Verify Redis Connection

```bash
redis-cli -u redis://USER:PASSWORD@HOST:6379 ping
# Should return: PONG
```

## Build Steps

```bash
# 1. Install dependencies
npm ci --production

# 2. Type check
npm run typecheck

# 3. Lint
npm run lint

# 4. Build TypeScript
npm run build

# 5. Verify build output exists
ls dist/
```

## Start/Run Commands

### Development
```bash
npm run dev
```

### Production
```bash
# Single instance
npm run start

# With process manager (recommended)
npm install -g pm2
pm2 start dist/index.js --name "tinkuy-api"
pm2 startup
pm2 save
```

### Docker (if using containerization)
```bash
docker build -t back-tinkuy .
docker run -d \
  --name tinkuy-api \
  -p 4000:4000 \
  --env-file .env.production \
  back-tinkuy
```

## Health Check Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Full health check (DB + Redis) |
| `/metrics` | GET | Application metrics |
| `/graphql` | GET/POST | GraphQL endpoint (requires valid query) |

### Health Check Response

```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### curl Examples

```bash
# Health check
curl https://api.yourdomain.com/health

# Metrics
curl https://api.yourdomain.com/metrics
```

## Security Checklist

### Environment
- [ ] `.env.production` is NOT committed to git
- [ ] All secrets are strong (32+ chars, random)
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL` set to exact production domain
- [ ] Redis has authentication enabled
- [ ] Database has strong password

### Application
- [ ] GraphQL introspection disabled in production (`NODE_ENV=production`)
- [ ] CORS restricted to specific frontend origin
- [ ] Rate limiting enabled and tuned
- [ ] JWT secrets are different for admin and customer tokens
- [ ] Webhook signature verification enabled
- [ ] Helmet security headers enabled
- [ ] Request timeout configured (30s)

### Infrastructure
- [ ] HTTPS/TLS termination at load balancer
- [ ] Database not exposed publicly
- [ ] Redis not exposed publicly
- [ ] Firewall rules configured
- [ ] DDoS protection enabled
- [ ] Backup strategy for database
- [ ] Redis persistence enabled (AOF)

### MercadoPago Webhook Registration

1. **Get your webhook URL**
   ```
   https://api.yourdomain.com/webhooks/mercadopago
   ```

2. **Register in MercadoPago Dashboard**
   - Go to: https://www.mercadopago.com/developers/panel
   - Select your application
   - Go to Webhooks > Notifications
   - Add URL: `https://api.yourdomain.com/webhooks/mercadopago`
   - Select events: `payment`

3. **Get Webhook Secret**
   - After registering, MercadoPago provides a `WEBHOOK_SECRET`
   - Add it to your environment: `MP_WEBHOOK_SECRET=whsec_xxx`

4. **Test Webhook**
   ```bash
   # Use MercadoPago sandbox to test
   curl -X POST https://api.yourdomain.com/webhooks/mercadopago \
     -H "Content-Type: application/json" \
     -d '{"type": "payment", "data": {"id": "123456"}}'
   ```

## Monitoring & Logging

### Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Development only |
| `info` | Production recommended |
| `warn` | Warning conditions |
| `error` | Errors that need attention |
| `fatal` | Critical failures |

### Log Output Format (JSON)

```json
{
  "service": "back-tinkuy-saludable",
  "env": "production",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "component": "server",
  "msg": "Server ready"
}
```

### Recommended Monitoring Setup

1. **Log Aggregation**: Ship JSON logs to:
   - ELK Stack (Elasticsearch, Logstash, Kibana)
   - Datadog
   - New Relic
   - CloudWatch Logs

2. **Metrics to Track**:
   - Request latency (p50, p95, p99)
   - Error rate
   - Database query time
   - Redis connection status
   - Memory/CPU usage

3. **Alerting**:
   - Health endpoint returning non-200
   - Error rate > 1%
   - Response time p99 > 2s
   - Redis disconnection

### Health Check Monitoring

```bash
# Example: Health check with alerting
HEALTH=$(curl -s https://api.yourdomain.com/health)
if echo $HEALTH | grep -q '"status":"ok"'; then
  echo "Healthy"
else
  echo "Unhealthy - investigate"
fi
```

## Quick Reference

```bash
# Full deployment sequence
npm ci --production
npm run db:generate
npm run db:migrate
npm run build
pm2 restart tinkuy-api

# Rollback
pm2 restart tinkuy-api --only昨:tinkuy-api
```

## Common Issues

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` Redis | Check REDIS_URL and Redis is running |
| `ECONNREFUSED` PostgreSQL | Check DATABASE_URL and PostgreSQL is running |
| Invalid JWT secret | Ensure secrets are 32+ characters |
| Webhook not receiving | Verify webhook URL is accessible, check firewall |
| CORS errors | Ensure FRONTEND_URL matches exactly |
