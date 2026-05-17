# Docker — Back-Tinkuy-Saludable

## Canonical Dokploy file

`docker-compose.yml` (this directory) is the **canonical file for Dokploy**.

Point Dokploy at this repo and select `docker-compose.yml` as the compose file.
Supply environment variables via Dokploy's environment panel — use
`env.example.dokploy` as the reference for every required variable.

Dokploy's built-in Traefik instance handles domain routing and SSL.
No nginx service is included.

## Local development

`docker-compose.override.yml` is loaded **automatically** by `docker compose`
when you run locally. It publishes host ports so you can reach services directly:

| Service    | Host port |
|------------|-----------|
| `backend`  | 4000      |
| `postgres` | 5432      |
| `redis`    | 6379      |

```bash
cp env.example.dokploy .env
# Fill in .env (at minimum: POSTGRES_*, JWT_*, ADMIN_PASSWORD, FRONTEND_URL)
docker compose up -d
```

Dokploy uses only `docker-compose.yml` — the override is never deployed.

## Services

| Service    | Build file         | Port     | Notes                              |
|------------|--------------------|----------|------------------------------------|
| `postgres`  | `postgres:15-alpine` | internal | Named volume `postgres_data`      |
| `redis`     | `redis:7-alpine`    | internal | Named volume `redis_data`         |
| `backend`   | `Dockerfile`        | 4000     | Apollo GraphQL + Express          |
| `worker`    | `Dockerfile.worker` | 4001     | Background jobs (dist/worker.js)  |
| `cron`      | `Dockerfile.cron`   | —        | Scheduled jobs (dist/cron.js)     |

## Superseded / reference-only compose files

These files are kept for historical reference. Do not use them for new deployments.

| File                          | Status                                              |
|-------------------------------|-----------------------------------------------------|
| `docker-compose.production.yml` | Superseded — earlier production compose (backend-only, with networks/deploy blocks) |
