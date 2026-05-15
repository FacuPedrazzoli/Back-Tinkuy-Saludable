# Deploy Backend Tinkuy en Railway

## Prerrequisitos

- Cuenta en [Railway.app](https://railway.app)
- Repositorio en GitHub con el código del backend
- Cuenta en Supabase (base de datos PostgreSQL)
- Cuenta en Upstash o Redis Cloud (Redis)

---

## Paso 1: Crear cuenta en Railway.app

1. Ir a [https://railway.app](https://railway.app)
2. Clic en "Sign Up"
3. Preferir autenticarse con GitHub para facilitar el deploy
4. Verificar email si es necesario

---

## Paso 2: Deploy from GitHub Repo

1. En Railway dashboard, clic en **"New Project"**
2. Seleccionar **"Deploy from GitHub repo"**
3. Autorizar acceso a GitHub si es la primera vez
4. Buscar y seleccionar el repositorio `Back-Tinkuy-Saludable`
5. Railway detectará automáticamente el `Dockerfile` (configurado en `railway.json`)
6. Clic en **"Deploy"** para iniciar el primer build

**Nota:** El `railway.json` ya está configurado para usar DOCKERFILE:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  }
}
```

---

## Paso 3: Configurar Variables de Entorno

1. En el proyecto de Railway, ir a la pestaña **"Variables"**
2. Agregar las siguientes variables una por una:

### Variables Obligatorias

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto del servidor | `4000` |
| `DATABASE_URL` | Connection string de Supabase | `postgresql://user:pass@host:5432/tinkuy` |
| `REDIS_URL` | URL de Redis (Upstash/Redis Cloud) | `redis://default:xxx@xxx.upstash.io:6379` |
| `JWT_ADMIN_SECRET` | Secret para JWT admin (32+ chars) | Generar con `openssl rand -base64 32` |
| `JWT_CUSTOMER_SECRET` | Secret para JWT customer (32+ chars) | Generar con `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens (32+ chars) | Generar con `openssl rand -base64 32` |
| `COOKIE_SECRET` | Secret para cookies (32 bytes exactos) | Generar con `openssl rand -hex 32` |
| `FRONTEND_URL` | URL del frontend en producción | `https://tinkuy.com.ar` |

### Variables de MercadoPago

| Variable | Descripción |
|----------|-------------|
| `MP_ACCESS_TOKEN` | Token de acceso de MercadoPago |
| `MP_WEBHOOK_SECRET` | Secret del webhook de MercadoPago |

### Variables de Email

| Variable | Descripción |
|----------|-------------|
| `SMTP_HOST` | Host SMTP (ej: `smtp.resend.com`) |
| `SMTP_PORT` | Puerto SMTP (ej: `587`) |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASSWORD` | Password SMTP |
| `EMAIL_FROM` | Email remitente (ej: `noreply@tinkuy.com.ar`) |
| `RESEND_API_KEY` | API Key de Resend (si usa Resend) |

### Variables Opcionales

| Variable | Descripción | Default |
|----------|-------------|---------|
| `SENTRY_DSN` | DSN de Sentry para errores | - |
| `GRAPHQL_INTROSPECTION` | Habilitar introspección GraphQL | `false` |
| `LOG_LEVEL` | Nivel de logs | `info` |

---

## Paso 4: Conectar Supabase (DB Externo)

### Opción A: Supabase (Recomendado)

1. Ir a [https://supabase.com](https://supabase.com) y crear proyecto
2. En Settings > Connection String, obtener:
   - Host: `db.[PROJECT_REF].supabase.co`
   - Puerto: `5432`
   - Usuario: `postgres`
   - Password: (la password configurada)
   - Base de datos: `postgres`

3. Construir `DATABASE_URL`:
```
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

4. En Railway > Variables, agregar:
   ```
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
   ```

### Ejecutar Migraciones

Railway ejecutará migrations automáticamente si tenés un script en package.json. Pero si necesitas ejecutarlas manualmente:

1. Instalar Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login:
   ```bash
   railway login
   ```

3. Linkear proyecto:
   ```bash
   railway link [PROJECT_ID]
   ```

4. Abrir shell de base de datos:
   ```bash
   railway run npx prisma migrate deploy
   ```

---

## Paso 5: Conectar Redis (Upstash o Railway Redis)

### Opción A: Upstash (Recomendado - Serverless)

1. Crear cuenta en [https://upstash.com](https://upstash.com)
2. Crear nueva base de datos Redis
3. En la pestaña "REST API", copiar:
   - `REDIS_URL`: `redis://default:[PASSWORD]@[ENDPOINT]:6379`

4. Agregar en Railway:
   ```
   REDIS_URL=redis://default:[PASSWORD]@[ENDPOINT]:6379
   ```

### Opción B: Railway Redis

1. En Railway dashboard, clic en **"New"**
2. Seleccionar **"Redis"**
3. Railway aprovisionará un contenedor Redis
4. En la pestaña "Variables" del servicio Redis, copiar `REDIS_URL`
5. Agregar como variable en el proyecto del backend

---

## Paso 6: Obtener URL Pública

1. En Railway, ir al proyecto de backend
2. En la sección "Settings" > "Networking":
   - Clic en **"Generate Domain"** para crear un subdomain de Railway
   - O agregar dominio personalizado si tenés

3. La URL pública será algo como:
   ```
   https://back-tinkuy-saludable.up.railway.app
   ```

4. **Importante:** Guardar esta URL para:
   - Configurar en frontend
   - Registrar en webhook de MercadoPago
   - Actualizar CORS en el backend si es necesario

---

## Paso 7: Actualizar CORS con URL Frontend

El backend ya está configurado para usar `FRONTEND_URL` de las variables de entorno para CORS. Asegurate de que:

1. `FRONTEND_URL` esté configurado correctamente:
   ```
   FRONTEND_URL=https://tinkuy.com.ar
   ```

2. Si el frontend usa un dominio diferente, actualizar esta variable en Railway.

---

## Paso 8: Verificar Deploy

### Health Check

Abrir en el navegador o hacer curl:

```
https://back-tinkuy-saludable.up.railway.app/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Verificar GraphQL

Hacer POST a `/graphql`:

```bash
curl -X POST https://back-tinkuy-saludable.up.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
```

---

## Configuración Adicional

### MercadoPago Webhook

Registrar el webhook en [MercadoPago Developer](https://www.mercadopago.com/developers/panel):

1. URL del webhook:
   ```
   https://back-tinkuy-saludable.up.railway.app/webhooks/mercadopago
   ```

2. Eventos a suscribir: `payment`

3. Obtener el `MP_WEBHOOK_SECRET` y agregarlo en Railway

### Dominio Personalizado (Opcional)

1. En Railway > Settings > Networking > Add Custom Domain
2. Agregar `api.tinkuy.com.ar`
3. Configurar DNS según las instrucciones de Railway (CNAME o A record)

---

## Troubleshooting

### Build Failures

1. Ver logs en Railway > Deployments
2. Asegurarse que el Dockerfile no tenga errores
3. Verificar que node_modules esté en .dockerignore

### Health Check Fails

1. Verificar que `PORT` en Railway variables coincida con el del código
2. Revisar logs de runtime en Railway > Logs

### Database Connection Errors

1. Verificar `DATABASE_URL` formato correcto
2. Confirmar que Supabase permita conexiones desde Railway (IP whitelist o SSL)

### Redis Connection Errors

1. Verificar `REDIS_URL`格式 correcto
2. Confirmar que Upstash/Redis acepte conexiones externas

---

## Scripts Útiles

### Deploy via CLI

```bash
# Instalar CLI
npm install -g @railway/cli

# Login
railway login

# Linkear proyecto
railway link

# Ver logs
railway logs

# Abrir en navegador
railway open
```

### Redeploy

Desde Railway dashboard:
1. Ir a Deployments
2. Clic en el botón "Redeploy" del deployment activo

O via CLI:
```bash
railway up
```
