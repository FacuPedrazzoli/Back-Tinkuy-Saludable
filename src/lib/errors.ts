import { GraphQLError, type GraphQLFormattedError } from "graphql";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super("FORBIDDEN", message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict detected") {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super("RATE_LIMITED", message, 429);
  }
}

export function formatError(
  formattedError: GraphQLFormattedError,
  error: unknown
): GraphQLFormattedError {
  const graphqlError = error as GraphQLError;
  const original = graphqlError.originalError;

  if (original instanceof AppError) {
    return {
      ...formattedError,
      message: original.message,
      extensions: {
        ...formattedError.extensions,
        code: original.code,
        statusCode: original.statusCode,
      },
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ...formattedError,
      message: "Internal server error",
      extensions: {
        ...formattedError.extensions,
        code: "INTERNAL_SERVER_ERROR",
        statusCode: 500,
      },
    };
  }

  return {
    ...formattedError,
    extensions: {
      ...formattedError.extensions,
      ...(graphqlError.stack ? { stack: graphqlError.stack } : {}),
    },
  };
}
