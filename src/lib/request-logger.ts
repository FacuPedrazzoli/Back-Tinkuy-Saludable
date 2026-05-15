import type { Request, Response, NextFunction } from "express";
import { createChildLogger } from "./logger";

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = req.headers["x-request-id"] as string ?? generateRequestId();

  const requestLog = createChildLogger({
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  req.requestId = requestId;

  requestLog.info("Incoming request");

  const originalEnd = res.end;
  res.end = function (this: Response, ...args: Parameters<Response["end"]>) {
    const duration = Date.now() - startTime;

    if (res.statusCode >= 400) {
      requestLog.error(`Request completed with status ${res.statusCode} in ${duration}ms`);
    } else {
      requestLog.info(`Request completed in ${duration}ms`);
    }

    return originalEnd.apply(this, args);
  } as typeof res.end;

  next();
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}
