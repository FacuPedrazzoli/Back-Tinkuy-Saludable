# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## [1.0.0] — Lanzamiento inicial — 2025-01-15

### Seguridad

- JWT con secretos separados para admin (24h) y customers (7d)
- Refresh token rotation con family-based tracking
- Rate limiting Redis-based (general 100/60s, auth 10/15min)
- bcrypt con 12 salt rounds para passwords
- AES-256-CBC cookie encryption
- Helmet.js security headers (CSP, HSTS, X-Frame-Options)
- HMAC-SHA256 webhook signature verification (MercadoPago)
- GraphQL depth limiting (10 niveles) y query complexity limits
- Token blacklist en Redis para revocation
- Token theft detection con revocación de familia
- Introspection disabled en producción
- CORS configurado con orígenes específicos
- Timeout middleware (30s) para requests

### Features

- Multi-tenant architecture con AsyncLocalStorage
- GraphQL API completa con Pothos schema builder
- Autenticación separada admin/customers
- Carrito persistente en Redis (24h TTL)
- Checkout con MercadoPago (preference creation, webhooks)
- Gestión de productos con variantes y atributos
- Stock tracking con ledger inmutable (INBOUND/OUTBOUND/ADJUSTMENT)
- Órdenes con snapshot de precios al momento
- Programa de puntos/fidelización (loyalty)
- Newsletter integration con Resend
- Reviews de productos
- Gestión de cupones de descuento
- Customer addresses múltiples
- Supplier management
- Tag-based product categorization

### Módulos GraphQL

- `auth` — Login, register, password change
- `tenants` — Tenant y branch management
- `catalog` — Products, variants, attributes, images, tags
- `inventory` — Stock movements ledger
- `cart` — Shopping cart con distributed locking
- `orders` — Order processing y history
- `checkout` — MercadoPago orchestration
- `customers` — Customer profiles y addresses
- `loyalty` — Points/fidelidad
- `newsletter` — Email subscriptions
- `reviews` — Product reviews
- `coupons` — Discount codes
- `media` — Image handling
- `categories` — Category management

### Performance

- Redis caching para stock (300s TTL)
- Redis caching para queries (60-300s según tipo)
- DataLoader pattern para batch loading
- LRU in-memory fallback cuando Redis unavailable
- Circuit breaker para servicios externos
- Query cache con invalidación por patrón
- Cart distributed locking para concurrent modifications
- Serializable isolation para stock-deducting transactions

### Technical

- Node.js >= 20.0.0
- TypeScript 5.3
- Express.js server
- PostgreSQL con Prisma ORM
- Redis (ioredis) para cache y sesiones
- MercadoPago SDK v2.0
- Zod validation para todos los inputs
- Structured JSON logging
- Sentry error tracking
- Docker containerization
- Railway deployment configuration
- Swagger/OpenAPI documentation (verificar)
- Vitest testing framework

### API Endpoints

- `POST /graphql` — GraphQL endpoint
- `GET /health` — Health check
- `POST /webhooks/mercadopago` — MP payment notifications

### Database

- Prisma schema con 20+ modelos
- Tenant isolation middleware
- Soft delete (isActive flag)
- Immutable stock ledger
- Order item snapshots
- WebhookEvent para idempotency
- Compound indexes para queries comunes

### Environment Variables

- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Redis connection
- `JWT_ADMIN_SECRET` — Admin JWT secret
- `JWT_CUSTOMER_SECRET` — Customer JWT secret
- `MP_ACCESS_TOKEN` — MercadoPago access token
- `MP_WEBHOOK_SECRET` — Webhook verification
- `MP_MODE` — test/production
- `PORT` — Server port (default 4000)
- `FRONTEND_URL` — CORS origin

---

## Version History

- [1.0.0](#100--lanzamiento-inicial--2025-01-15) — Lanzamiento inicial — 2025-01-15
