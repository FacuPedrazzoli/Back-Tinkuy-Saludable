# Variables de Entorno - Tinkuy Backend

Todas las variables necesarias para deploy en Railway con valores de ejemplo y descripción completa.

---

## Variables de Base de Datos

### `DATABASE_URL`

**Required:** Sí  
**Descripción:** Connection string completo de PostgreSQL (Supabase o cualquier otro proveedor)  
**Formato:** `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`  
**Ejemplo (Supabase):** `postgresql://postgres:myPassword123@db.xyz123.supabase.co:5432/postgres`  
**Ejemplo (Local):** `postgresql://postgres:password@localhost:5432/tinkuy`

---

## Variables de Redis

### `REDIS_URL`

**Required:** Sí  
**Descripción:** URL de conexión a Redis  
**Formato:** `redis://[USER]:[PASSWORD]@[HOST]:[PORT]`  
**Ejemplo (Upstash):** `redis://default:abc123xyz@abc123.upstash.io:6379`  
**Ejemplo (Local):** `redis://localhost:6379`  
**Notas:** Upstash usa `default` como usuario

### `REDIS_PASSWORD`

**Required:** No (solo si Redis requiere auth)  
**Descripción:** Password separado para Redis (usado en algunas configuraciones)  
**Ejemplo:** `my-redis-password`

---

## Variables de JWT / Authentication

### `JWT_ADMIN_SECRET`

**Required:** Sí  
**Descripción:** Secret para firmar JWT de administradores del sistema  
**Requisito:** Mínimo 32 caracteres, generar con `openssl rand -base64 32`  
**Ejemplo:** `YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw`

### `JWT_CUSTOMER_SECRET`

**Required:** Sí  
**Descripción:** Secret para firmar JWT de clientes usuarios  
**Requisito:** Mínimo 32 caracteres  
**Ejemplo:** `cXV5enoiZ3JvdXBzZWdtZW50dW5pb25wcml2YWN5YWJjMTIz`

### `JWT_REFRESH_SECRET`

**Required:** Sí  
**Descripción:** Secret para firmar refresh tokens (token de renovación)  
**Requisito:** Mínimo 32 caracteres  
**Ejemplo:** `cmVmcmVzaHRva2VuZ2VuZXJhdGlvbnNhbHQyNTZzZWNyZXQ`

### `COOKIE_SECRET`

**Required:** Sí  
**Descripción:** Secret para cifrar cookies de sesión (AES-256-CBC)  
**Requisito:** Exactamente 32 bytes (64 caracteres hex)  
**Generar:** `openssl rand -hex 32`  
**Ejemplo:** `7c0a8f3e9b4d1c5a6e2f8b3d9a1c7e4f5b2d8a3c6e9f1b4d2a7c8e5f9b1d3a6`

---

## Variables de MercadoPago

### `MP_ACCESS_TOKEN`

**Required:** Sí (si se usan pagos)  
**Descripción:** Token de acceso a la API de MercadoPago  
**Obtenido de:** https://www.mercadopago.com/developers/panel/app/{APP_ID}/credentials  
**Ejemplo:** `APP_USR-1234567890123456-123456-abcdef1234567890-1234567890123456`

### `MP_PUBLIC_KEY`

**Required:** Solo si se usa frontend MP  
**Descripción:** Clave pública de MercadoPago para frontend  
**Ejemplo:** `APP_USR-12345678-abcdefgh-ijklmnop-qrstuvwx-yz1234567890ab`

### `MP_WEBHOOK_SECRET`

**Required:** Sí (para producción)  
**Descripción:** Secret para verificar firmas de webhooks de MercadoPago  
**Obtenido de:** Panel de MercadoPago > Webhooks  
**Ejemplo:** `whsec_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`

### `MP_SANDBOX_INIT_POINT`

**Required:** No (testing)  
**Descripción:** URL del init point de MercadoPago sandbox  
**Default:** `https://sandbox.mercadopago.com/checkout/v2`

### `MP_PRODUCTION_INIT_POINT`

**Required:** No (producción)  
**Descripción:** URL del init point de MercadoPago producción  
**Default:** `https://mercadopago.com/checkout/v2`

### `MP_MODE`

**Required:** No  
**Descripción:** Modo de MercadoPago  
**Valores:** `sandbox` | `production`  
**Default:** `sandbox`

---

## Variables de Email

### `SMTP_HOST`

**Required:** Sí (si se envían emails)  
**Descripción:** Host del servidor SMTP  
**Ejemplo (Resend):** `smtp.resend.com`  
**Ejemplo (SendGrid):** `smtp.sendgrid.net`

### `SMTP_PORT`

**Required:** Sí  
**Descripción:** Puerto del servidor SMTP  
**Ejemplo:** `587` (TLS) o `465` (SSL)

### `SMTP_USER`

**Required:** Sí  
**Descripción:** Usuario para autenticación SMTP  
**Ejemplo (SendGrid):** `apikey`

### `SMTP_PASSWORD`

**Required:** Sí  
**Descripción:** Password o API key para SMTP  
**Ejemplo (SendGrid):** `SG.xxxxxxx.xxxxxxx`  
**Ejemplo (Resend):** `re_xxxxxx`

### `EMAIL_FROM`

**Required:** Sí  
**Descripción:** Email remitente en emails enviados  
**Formato:** `Name <email@domain.com>` o solo `email@domain.com`  
**Ejemplo:** `Tinkuy <noreply@tinkuy.com.ar>`

### `RESEND_API_KEY`

**Required:** Solo si usa Resend  
**Descripción:** API Key de Resend para envío de emails  
**Obtenido de:** https://resend.com/api-keys  
**Ejemplo:** `re_123456789abcdef`

---

## Variables de Frontend / CORS

### `FRONTEND_URL`

**Required:** Sí  
**Descripción:** URL completa del frontend para configuración CORS  
**Ejemplo:** `https://tinkuy.com.ar`  
**Ejemplo (dev):** `http://localhost:5173`  
**Notas:** Sin trailing slash, debe incluir protocolo (http/https)

---

## Variables de Entorno y Servidor

### `NODE_ENV`

**Required:** Sí (production)  
**Descripción:** Entorno de ejecución  
**Valores:** `development` | `production` | `test`  
**Default:** `production` para Railway

### `PORT`

**Required:** Sí  
**Descripción:** Puerto donde escucha el servidor  
**Ejemplo:** `4000`  
**Notas:** Railway sobreescribe con su propio puerto, pero el código debe usar `process.env.PORT`

### `LOG_LEVEL`

**Required:** No  
**Descripción:** Nivel de logging  
**Valores:** `debug` | `info` | `warn` | `error` | `fatal`  
**Default:** `info`

### `TRUST_PROXY`

**Required:** No  
**Descripción:** Número de proxies confiables (para HTTPS detrás de load balancer)  
**Ejemplo:** `1` o `true`

---

## Variables de Sentry (Error Tracking)

### `SENTRY_DSN`

**Required:** No  
**Descripción:** DSN de Sentry para envío de errores  
**Obtenido de:** https://sentry.io/settings/{ORG}/projects/{PROJECT}/keys/  
**Ejemplo:** `https://abc123@o123456.ingest.sentry.io/1234567`

### `SENTRY_ORG`

**Required:** No  
**Descripción:** Organización de Sentry  
**Ejemplo:** `my-organization`

### `SENTRY_PROJECT`

**Required:** No  
**Descripción:** Nombre del proyecto en Sentry  
**Ejemplo:** `tinkuy-backend`

---

## Variables de GraphQL

### `GRAPHQL_INTROSPECTION`

**Required:** No  
**Descripción:** Habilitar introspección GraphQL  
**Valores:** `true` | `false`  
**Default:** `false` en producción (recomendado)  
**Notas:** Deshabilitar introspección mejora seguridad en producción

---

## Variables de Rate Limiting

### `RATE_LIMIT_MAX`

**Required:** No  
**Descripción:** Número máximo de requests por ventana  
**Default:** `100`

### `RATE_LIMIT_WINDOW_MS`

**Required:** No  
**Descripción:** Ventana de tiempo para rate limiting en milliseconds  
**Default:** `60000` (1 minuto)

### `RATE_LIMIT_GENERAL_MAX_REQUESTS`

**Required:** No  
**Descripción:** Requests máximos para endpoint generales  
**Default:** `100`

### `RATE_LIMIT_GENERAL_WINDOW_MS`

**Required:** No  
**Descripción:** Ventana para rate limit general en ms  
**Default:** `60000`

### `RATE_LIMIT_AUTH_MAX_REQUESTS`

**Required:** No  
**Descripción:** Requests máximos para endpoints de autenticación  
**Default:** `10`

### `RATE_LIMIT_AUTH_WINDOW_MS`

**Required:** No  
**Descripción:** Ventana para rate limit de auth en ms  
**Default:** `900000` (15 minutos)

### `RATE_LIMIT_CHECKOUT_MAX_REQUESTS`

**Required:** No  
**Descripción:** Requests máximos para checkout  
**Default:** `10`

### `RATE_LIMIT_CHECKOUT_WINDOW_MS`

**Required:** No  
**Descripción:** Ventana para rate limit de checkout en ms  
**Default:** `60000`

---

## Variables de Carrito (Cart)

### `CART_TTL_SECONDS`

**Required:** No  
**Descripción:** TTL del carrito en segundos  
**Default:** `86400` (24 horas)

### `CART_LOCK_TTL_SECONDS`

**Required:** No  
**Descripción:** TTL del lock de carrito en segundos  
**Default:** `5`

### `CART_LOCK_RETRY_COUNT`

**Required:** No  
**Descripción:** Intentos de retry para lock de carrito  
**Default:** `3`

### `CART_LOCK_RETRY_DELAY_MS`

**Required:** No  
**Descripción:** Delay entre retries de lock en ms  
**Default:** `100`

---

## Variables de Stock

### `STOCK_TTL_SECONDS`

**Required:** No  
**Descripción:** TTL del cache de stock en segundos  
**Default:** `300` (5 minutos)

---

## Variables de Webhook

### `WEBHOOK_TIMEOUT_MS`

**Required:** No  
**Descripción:** Timeout para webhooks en ms  
**Default:** `30000` (30 segundos)

---

## Variables de File Upload

### `UPLOAD_DIR`

**Required:** No  
**Descripción:** Directorio para uploads  
**Default:** `/app/uploads`

### `MAX_FILE_SIZE_MB`

**Required:** No  
**Descripción:** Tamaño máximo de archivo en MB  
**Default:** `5`

---

## Resumen - Variables Obligatorias para Railway

| Variable | Required |
|----------|----------|
| `NODE_ENV` | ✅ |
| `PORT` | ✅ |
| `DATABASE_URL` | ✅ |
| `REDIS_URL` | ✅ |
| `JWT_ADMIN_SECRET` | ✅ |
| `JWT_CUSTOMER_SECRET` | ✅ |
| `JWT_REFRESH_SECRET` | ✅ |
| `COOKIE_SECRET` | ✅ |
| `FRONTEND_URL` | ✅ |
| `MP_ACCESS_TOKEN` | Si usas pagos |
| `MP_WEBHOOK_SECRET` | Si usas pagos |

---

## Generador de Secrets

Para generar secrets seguros, ejecutar:

```bash
# JWT secrets (base64, 32+ chars)
openssl rand -base64 32

# Cookie secret (hex, 32 bytes = 64 chars)
openssl rand -hex 32
```

---

## Archivo .env Completo para Producción

```env
# Database
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres

# Redis
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_UPSTASH_ENDPOINT.upstash.io:6379

# JWT
JWT_ADMIN_SECRET=$(openssl rand -base64 32)
JWT_CUSTOMER_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
COOKIE_SECRET=$(openssl rand -hex 32)

# Server
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://tinkuy.com.ar

# MercadoPago
MP_ACCESS_TOKEN=APP_USR-YOUR_TOKEN
MP_WEBHOOK_SECRET=whsec_YOUR_SECRET

# Email (Resend ejemplo)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=re_YOUR_API_KEY
EMAIL_FROM=Tinkuy <noreply@tinkuy.com.ar>
```
