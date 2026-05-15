import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
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
import { validateSecrets } from "@lib/jwt";
import jwt from "jsonwebtoken";
import { depthLimitPlugin } from "@graphql/plugins/depth-limit";

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

if (!process.env.FRONTEND_URL && process.env.NODE_ENV === "production") {
  console.error("FRONTEND_URL environment variable is required in production");
  process.exit(1);
}

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(timeout('30s'));

app.use((req, _res, next) => {
  let tenantId: string | null = null;

  const auth = req.headers.authorization;
  if (auth) {
    const [scheme, token] = auth.split(" ");
    if (scheme === "Bearer" && token) {
      try {
        const decoded = jwt.decode(token) as { tenantId?: string } | null;
        if (decoded?.tenantId) {
          tenantId = decoded.tenantId;
        }
      } catch {
        // invalid token format, ignore
      }
    }
  }

  if (!tenantId) {
    tenantId = (req.headers["x-tenant-id"] as string | undefined) ?? null;
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
  const dbHealthy = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const redisHealthy = await pingRedis();
  const status = dbHealthy && redisHealthy ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? "ok" : "degraded",
    database: dbHealthy ? "connected" : "disconnected",
    redis: redisHealthy ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
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
  validateSecrets();
  console.log("✅ JWT secrets validated");

  // Verify database connection
  await prisma.$connect();
  console.log("✅ Database connected");

  const server = new ApolloServer({
    schema,
    formatError,
    introspection: process.env.NODE_ENV === "production",
    plugins: [depthLimitPlugin],
  });

  await server.start();

  app.use(
    "/graphql",
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => createContext({ req }),
    })
  );

  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
    console.log(`💓 Health check: http://localhost:${PORT}/health`);
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  setTimeout(() => process.exit(1), 10000);
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  setTimeout(() => process.exit(1), 10000);
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
