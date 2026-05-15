# Facusito API

Backend completo para e-commerce B2B/B2C de productos dietéticos.

## Stack

- **Node.js 20** + TypeScript (strict)
- **Express** + Apollo Server v4
- **GraphQL** code-first con Pothos + Prisma plugin
- **Prisma ORM** + PostgreSQL
- **Redis** (carrito, stock cache, rate limiting)
- **MercadoPago** checkout
- **JWT** dual (Admin/Customer)
- **Multi-tenancy** por middleware Prisma

## Arquitectura

```
src/
├── graphql/           # Pothos builder, context, schema
├── lib/               # Prisma, Redis, JWT, errors, validation, cache, rate-limit
├── modules/           # Dominios: auth, tenants, catalog, media, inventory, customers, cart, checkout, orders
└── index.ts           # Express + Apollo bootstrap
```

## Quick Start

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 3. Generar cliente Prisma y correr migraciones
npx prisma generate
npx prisma migrate dev

# 4. Iniciar servidor de desarrollo
npm run dev
```

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor con hot-reload (tsx watch) |
| `npm run build` | Compilar TypeScript |
| `npm run start` | Iniciar producción |
| `npm run db:migrate` | Correr migraciones |
| `npm run db:generate` | Generar cliente Prisma |
| `npm run db:studio` | Prisma Studio |
| `npm run typecheck` | Verificación de tipos |

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ADMIN_SECRET` | Secret para tokens de admin |
| `JWT_CUSTOMER_SECRET` | Secret para tokens de customer |
| `MP_ACCESS_TOKEN` | MercadoPago access token |
| `MP_WEBHOOK_SECRET` | Secret para validar webhooks |
| `PORT` | Puerto del servidor (default: 4000) |
| `FRONTEND_URL` | URL del frontend para CORS |

## GraphQL

- **Endpoint**: `POST /graphql`
- **Introspección**: habilitada en development
- **Auth**: Header `Authorization: Bearer <token>`
- **Tenant**: Header `x-tenant-id` (o extraído del JWT)

## Endpoints REST

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Health check (DB + Redis) |
| `/webhooks/mercadopago` | POST | Webhook de pagos |

## Multi-tenancy

Cada request lleva un `tenantId` que se inyecta automáticamente en todas las queries Prisma mediante middleware. Los datos están aislados por tenant a nivel de aplicación.

## Carrito (Redis)

- **Guest**: `cart:<uuid>` — TTL 24h
- **Auth**: `cart:user:<id>` — TTL 24h
- Merge automático al login

## Inventario

Ledger inmutable (`StockMovement`). Stock computado como SUM de movimientos, con cache en Redis (TTL 5 min) e invalidación automática.

## Licencia

MIT
