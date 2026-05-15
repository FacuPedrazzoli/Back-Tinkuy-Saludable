import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { CircuitBreaker } from "@lib/circuit-breaker";

vi.mock("@lib/config", () => ({
  config: {
    mercadoPago: {
      accessToken: "test-token",
      mode: "test",
    },
    redis: {
      url: "redis://localhost:6379",
    },
    cart: {
      ttlSeconds: 3600,
      lockTtlSeconds: 10,
      lockRetryCount: 3,
      lockRetryDelayMs: 100,
    },
    cache: {
      stockTtlSeconds: 300,
    },
  },
}));

vi.mock("@lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("mercadopago", () => {
  describe("CircuitBreaker", () => {
    it("starts in CLOSED state", () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 1000, halfOpenMaxCalls: 2 });
      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getFailures()).toBe(0);
    });

    it("transitions to OPEN after reaching failure threshold", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 5000, halfOpenMaxCalls: 2 });

      const failingFn = vi.fn().mockRejectedValue(new Error("5xx error"));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {}
      }

      expect(breaker.getState()).toBe("OPEN");
      expect(breaker.getFailures()).toBe(3);
    });

    it("throws error when circuit is OPEN and before reset timeout", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 10000, halfOpenMaxCalls: 2 });

      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      await breaker.execute(failingFn).catch(() => {});
      await breaker.execute(failingFn).catch(() => {});

      expect(breaker.getState()).toBe("OPEN");

      const successFn = vi.fn().mockResolvedValue("data");
      await expect(breaker.execute(successFn)).rejects.toThrow("Circuit breaker is OPEN");
    });

    it("transitions to HALF_OPEN after reset timeout", async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 1000, halfOpenMaxCalls: 2 });

      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      await breaker.execute(failingFn).catch(() => {});
      await breaker.execute(failingFn).catch(() => {});

      expect(breaker.getState()).toBe("OPEN");

      await vi.advanceTimersByTimeAsync(1001);

      const successFn = vi.fn().mockResolvedValue("data");
      const result = await breaker.execute(successFn);

      expect(result).toBe("data");
      expect(breaker.getState()).toBe("CLOSED");

      vi.useRealTimers();
    });

    it("resets failure count on success", async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 5000, halfOpenMaxCalls: 2 });

      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      await breaker.execute(failingFn).catch(() => {});
      await breaker.execute(failingFn).catch(() => {});

      expect(breaker.getFailures()).toBe(2);

      const successFn = vi.fn().mockResolvedValue("data");
      await breaker.execute(successFn);

      expect(breaker.getFailures()).toBe(0);
    });

    it("resets to CLOSED state via reset method", () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 5000, halfOpenMaxCalls: 2 });

      breaker.reset();

      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getFailures()).toBe(0);
    });

    it("handles success in HALF_OPEN and transitions to CLOSED", async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 1000, halfOpenMaxCalls: 2 });

      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      await breaker.execute(failingFn).catch(() => {});
      await breaker.execute(failingFn).catch(() => {});

      expect(breaker.getState()).toBe("OPEN");

      await vi.advanceTimersByTimeAsync(1001);

      const successFn = vi.fn().mockResolvedValue("ok");
      await breaker.execute(successFn);

      expect(breaker.getState()).toBe("CLOSED");

      vi.useRealTimers();
    });

    it("handles failure in HALF_OPEN and transitions back to OPEN", async () => {
      vi.useFakeTimers();

      const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 1000, halfOpenMaxCalls: 2 });

      const failingFn = vi.fn().mockRejectedValue(new Error("fail"));
      await breaker.execute(failingFn).catch(() => {});
      await breaker.execute(failingFn).catch(() => {});

      await vi.advanceTimersByTimeAsync(1001);

      const halfOpenFailingFn = vi.fn().mockRejectedValue(new Error("half-open fail"));
      await breaker.execute(halfOpenFailingFn).catch(() => {});

      expect(breaker.getState()).toBe("OPEN");

      vi.useRealTimers();
    });
  });
});
