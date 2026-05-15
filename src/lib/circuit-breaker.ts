type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxCalls: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 60000,
  halfOpenMaxCalls: 3,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  constructor(private options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= (this.options.resetTimeout ?? 60000)) {
        this.state = "HALF_OPEN";
        this.halfOpenCalls = 0;
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    if (this.state === "HALF_OPEN" && this.halfOpenCalls >= (this.options.halfOpenMaxCalls ?? 3)) {
      throw new Error("Circuit breaker is HALF_OPEN and max calls reached");
    }

    try {
      if (this.state === "HALF_OPEN") {
        this.halfOpenCalls++;
      }
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
    } else if (this.failures >= (this.options.failureThreshold ?? 5)) {
      this.state = "OPEN";
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = 0;
  }
}

export const mpCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenMaxCalls: 2,
});
