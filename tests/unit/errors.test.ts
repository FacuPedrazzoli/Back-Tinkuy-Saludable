import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphQLError } from "graphql";
import {
  formatError,
  AppError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from "@lib/errors";

const originalNodeEnv = process.env.NODE_ENV;

describe("formatError", () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const baseFormattedError = {
    message: "An error occurred",
    locations: [{ line: 1, column: 1 }],
    path: ["test"],
    extensions: {},
  };

  describe("when originalError is an AppError subclass", () => {
    it("returns formatted error with code and statusCode from AppError", () => {
      const originalError = new AuthenticationError("Invalid credentials");
      const result = formatError(baseFormattedError, new GraphQLError("msg", { originalError }));

      expect(result.message).toBe("Invalid credentials");
      expect(result.extensions?.code).toBe("UNAUTHENTICATED");
      expect(result.extensions?.statusCode).toBe(401);
    });

    it("handles ValidationError", () => {
      const originalError = new ValidationError("Email is required");
      const result = formatError(baseFormattedError, new GraphQLError("msg", { originalError }));

      expect(result.message).toBe("Email is required");
      expect(result.extensions?.code).toBe("VALIDATION_ERROR");
      expect(result.extensions?.statusCode).toBe(400);
    });

    it("handles NotFoundError", () => {
      const originalError = new NotFoundError("Product");
      const result = formatError(baseFormattedError, new GraphQLError("msg", { originalError }));

      expect(result.message).toBe("Product not found");
      expect(result.extensions?.code).toBe("NOT_FOUND");
      expect(result.extensions?.statusCode).toBe(404);
    });

    it("overrides message and adds code/statusCode from AppError", () => {
      const originalError = new AppError("ERR", "Custom error", 422);
      const error = new GraphQLError("msg", { originalError });
      const result = formatError(baseFormattedError, error);

      expect(result.message).toBe("Custom error");
      expect(result.extensions?.code).toBe("ERR");
      expect(result.extensions?.statusCode).toBe(422);
    });
  });

  describe("when originalError is not an AppError", () => {
    it("returns generic error in production with INTERNAL_SERVER_ERROR code", () => {
      process.env.NODE_ENV = "production";

      const result = formatError(
        baseFormattedError,
        new GraphQLError("Database connection failed")
      );

      expect(result.message).toBe("Internal server error");
      expect(result.extensions?.code).toBe("INTERNAL_SERVER_ERROR");
      expect(result.extensions?.statusCode).toBe(500);
    });

    it("includes stack trace in development", () => {
      process.env.NODE_ENV = "development";

      const error = new GraphQLError("Something went wrong");
      const result = formatError(baseFormattedError, error);

      expect(result.extensions?.stack).toBeDefined();
      expect(typeof result.extensions?.stack).toBe("string");
    });

    it("omits stack trace in production", () => {
      process.env.NODE_ENV = "production";

      const error = new GraphQLError("Something went wrong");
      const result = formatError(baseFormattedError, error);

      expect(result.extensions?.stack).toBeUndefined();
    });

    it("handles error with no originalError", () => {
      process.env.NODE_ENV = "development";

      const result = formatError(baseFormattedError, new GraphQLError("Generic error"));

      expect(result.message).toBe("An error occurred");
      expect(result.extensions?.stack).toBeDefined();
    });

    it("handles non-Error thrown (primitives)", () => {
      process.env.NODE_ENV = "development";

      const result = formatError(baseFormattedError, "string error" as any);

      expect(result.message).toBe("An error occurred");
    });
  });
});
