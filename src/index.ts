import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import timeout from "connect-timeout";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { schema } from "@graphql/schema";
import { createContext } from "@graphql/context";
import { formatError } from "@lib/errors";
import { prisma } from "@lib/prisma";
import { redis, pingRedis } from "@lib/redis";
import { rateLimitGeneral } from "@lib/rate-limit";
import { handleWebhook } from "@modules/checkout/webhook.handler";
import { runWithTenantSync } from "@lib/tenant-context";
import { validateSecrets, validatedAdminSecret, validatedCustomerSecret } from "@lib/jwt";
import { validateConfig } from "@lib/config";
import jwt from "jsonwebtoken";
import { depthLimitPlugin } from "@graphql/plugins/depth-limit";
import { logger } from "@lib/logger";
import { requestLoggingMiddleware } from "@lib/request-logger";
import { getMetricsSummary, getMetrics } from "@lib/metrics";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined) {
  const proxyValue = parseInt(trustProxy, 10);
  if (!isNaN(proxyValue) && proxyValue > 0) {
    app.set("trust proxy", proxyValue);
  } else if (trustProxy === "true" || trustProxy === "1") {
    app.set("trust proxy", 1);
  }
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  xContentTypeOptions: true,
  xFrameOptions: "DENY",
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
const corsOptions: cors.CorsOptions = {
  origin: false,
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
  maxAge: 86400,
};

if (process.env.FRONTEND_URL) {
  corsOptions.origin = process.env.FRONTEND_URL;
  corsOptions.credentials = true;
}

app.use(cors(corsOptions));
app.use(compression());
app.use(timeout('30s'));
app.use(requestLoggingMiddleware);

app.use((req, res) => {
  if (req.timedout && !res.headersSent) {
    res.status(408).json({ error: "Request timeout" });
  }
});

app.use((req, _res, next) => {
  let tenantId: string | null = null;

  const auth = req.headers.authorization;
  if (auth) {
    const [scheme, token] = auth.split(" ");
    if (scheme === "Bearer" && token) {
      try {
        const secrets = [
          { secret: validatedAdminSecret },
          { secret: validatedCustomerSecret },
        ];
        let decoded: { tenantId?: string } | null = null;
        for (const { secret } of secrets) {
          try {
            decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as { tenantId?: string } | null;
            break;
          } catch {
            // try next secret
          }
        }
        if (decoded?.tenantId && typeof decoded.tenantId === "string" && decoded.tenantId.length > 0 && decoded.tenantId.length <= 64) {
          tenantId = decoded.tenantId;
        }
      } catch {
        // Token inválido, no establecer tenantId
      }
    }
  }

  if (!tenantId) {
    const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
    if (headerTenantId && typeof headerTenantId === "string" && headerTenantId.length > 0 && headerTenantId.length <= 64) {
      tenantId = headerTenantId;
    }
  }

  if (tenantId) {
    runWithTenantSync(tenantId, next);
  } else {
    next();
  }
});

app.use(express.json());

// Health check
app.get("/health", async (_req, res) => {
  try {
    const dbHealthy = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisHealthy = await pingRedis();
    const status = dbHealthy && redisHealthy ? 200 : 503;
    res.status(status).json({
      status: status === 200 ? "ok" : "degraded",
      database: dbHealthy ? "connected" : "disconnected",
      redis: redisHealthy ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, component: "health" }, "Health check failed");
    res.status(503).json({
      status: "error",
      database: "unknown",
      redis: "unknown",
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/metrics", (_req, res) => {
  const metrics = getMetrics();
  res.json(metrics);
});

// MercadoPago webhook
app.post(
  "/webhooks/mercadopago",
  async (req, _res, next) => {
    try {
      const identifier = req.ip ?? req.socket.remoteAddress ?? "unknown";
      await rateLimitGeneral(`webhook:${identifier}`);
      next();
    } catch (err) {
      next(err);
    }
  },
  express.raw({ type: "application/json" }),
  handleWebhook
);

async function bootstrap() {
  validateConfig();
  logger.info({ component: "bootstrap" }, "Configuration validated");

  validateSecrets();
  logger.info({ component: "bootstrap" }, "JWT secrets validated");

  await prisma.$connect();
  logger.info({ component: "bootstrap" }, "Database connected");

  server = new ApolloServer({
    schema,
    formatError,
    introspection: process.env.NODE_ENV === "production",
    plugins: [depthLimitPlugin],
  });

  await server.start();
  logger.info({ component: "bootstrap" }, "Apollo Server started");

  app.use(
    "/graphql",
    express.json(),
    async (req, _res, next) => {
      try {
        const identifier = req.ip ?? req.socket.remoteAddress ?? "anonymous";
        await rateLimitGeneral(`graphql:${identifier}`);
        next();
      } catch (err) {
        next(err);
      }
    },
    expressMiddleware(server, {
      context: async ({ req }) => createContext({ req }),
    })
  );

  app.listen(PORT, () => {
    logger.info(
      { component: "server", port: PORT },
      `Server ready at http://localhost:${PORT}`
    );
    logger.info(
      { component: "server", endpoint: `/graphql` },
      `GraphQL endpoint: http://localhost:${PORT}/graphql`
    );
    logger.info(
      { component: "server", endpoint: `/health` },
      `Health check: http://localhost:${PORT}/health`
    );
    logger.info(
      { component: "server", endpoint: `/metrics` },
      `Metrics endpoint: http://localhost:${PORT}/metrics`
    );

    setInterval(() => {
      getMetricsSummary();
    }, 60000);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err, component: "bootstrap" }, "Bootstrap failed");
  process.exit(1);
});

process.on("SIGTERM", async () => {
  logger.info({ component: "shutdown" }, "SIGTERM received, shutting down gracefully");
  getMetricsSummary();
  if (server) await server.stop();
  await prisma.$disconnect();
  await redis.quit();
  logger.info({ component: "shutdown" }, "Graceful shutdown completed");
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info({ component: "shutdown" }, "SIGINT received, shutting down gracefully");
  getMetricsSummary();
  if (server) await server.stop();
  await prisma.$disconnect();
  await redis.quit();
  logger.info({ component: "shutdown" }, "Graceful shutdown completed");
  process.exit(0);
});

process.on("unhandledRejection", (reason, _promise) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error({ reason: message, component: "process" }, "Unhandled Rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err, component: "process" }, "Uncaught Exception");
  process.exit(1);
});
