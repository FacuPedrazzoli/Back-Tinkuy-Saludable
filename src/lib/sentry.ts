import * as Sentry from "@sentry/node";
import { config } from "./config";

export function initSentry() {
  if (!config.sentry.dsn) {
    console.warn("Sentry DSN not configured, skipping initialization");
    return;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.app.env,
    release: config.app.version,
    tracesSampleRate: config.app.env === "production" ? 0.1 : 1.0,
    profilesSampleRate: config.app.env === "production" ? 0.1 : 1.0,
    ignoreErrors: ["ValidationError", "NotFoundError", "AuthError"],
  });

  console.info("Sentry initialized");
}

export function captureException(error: unknown, extra?: Record<string, unknown>) {
  Sentry.captureException(error, { extra });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  Sentry.captureMessage(message, level);
}

export const sentryHandlers = Sentry.Handlers;
