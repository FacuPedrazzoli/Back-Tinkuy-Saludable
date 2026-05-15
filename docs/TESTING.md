# Testing Guide - Back Tinkuy Saludable

## Test Framework

**Vitest** v1.6.1 with TypeScript support.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run specific test file
npx vitest run tests/unit/auth.service.test.ts
```

## Test Directory Structure

```
tests/
├── setup.ts                      # Environment setup
├── smoke.test.ts                 # Integration tests (requires running server)
└── unit/
    ├── auth.service.test.ts      # Authentication service tests
    ├── catalog.service.test.ts   # Catalog/product service tests
    ├── errors.test.ts            # Error formatting tests
    └── inventory.service.test.ts # Inventory/stock service tests
```

## Test Setup

`tests/setup.ts` configures the test environment:

```typescript
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
process.env.REDIS_URL = "redis://localhost:6379";
```

## Writing Unit Tests

### Basic Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Service Name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("methodName", () => {
    it("should do something", async () => {
      // Arrange: set up mocks
      mockedPrisma.user.findUnique.mockResolvedValue({ id: "1", name: "Test" });

      // Act
      const result = await myFunction("input");

      // Assert
      expect(result.name).toBe("Test");
    });
  });
});
```

### Mock Patterns

**Mock Prisma:**
```typescript
vi.mock("@lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@lib/prisma";
const mockedPrisma = vi.mocked(prisma);
```

**Mock JWT:**
```typescript
vi.mock("@lib/jwt", () => ({
  signAdminToken: () => "admin-token",
  signCustomerToken: () => "customer-token",
}));
```

**Mock Cache:**
```typescript
vi.mock("@lib/cache", () => ({
  getStockCached: vi.fn().mockResolvedValue({ found: false, value: null }),
  invalidateStockCache: vi.fn(),
}));
```

**Configure mock implementation in beforeEach:**
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockedPrisma.$transaction).mockImplementation(async (callback) => {
    return callback(mockedPrisma);
  });
});
```

**Mock a specific call:**
```typescript
vi.mocked(mockedPrisma.user.findUnique).mockResolvedValue({
  id: "1",
  email: "test@example.com",
});
```

**Assert mock was called:**
```typescript
expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
  where: { id: "1" },
});
```

## Writing Integration Tests (Smoke Tests)

Smoke tests (`tests/smoke.test.ts`) run against a live server and test the full API flow.

**Prerequisites:**
- Server running on `localhost:4000`
- Database migrated and seeded
- Redis running

**Example smoke test:**
```typescript
const API_URL = "http://localhost:4000/graphql";

async function gql(query: string, variables?: Record<string, unknown>, token?: string) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

it("full customer flow", async () => {
  const registerResult = await gql(`
    mutation Register($input: CustomerRegisterInput!) {
      customerRegister(input: $input) {
        token
        customer { id email }
      }
    }
  `, { input: { tenantId: "seed-tenant-1", email: "test@test.com", password: "Pass123!", firstName: "Test", lastName: "User" } });

  expect(registerResult.errors).toBeUndefined();
  expect(registerResult.data?.customerRegister.token).toBeDefined();
});
```

## Current Test Status

```
Test Files: 5 total
Tests: 48 total (43 passing, 5 failing)
```

### Passing Tests

- **auth.service.test.ts**: 18 tests
- **catalog.service.test.ts**: 5 tests (7 total, 2 failing)
- **errors.test.ts**: 9 tests
- **inventory.service.test.ts**: 11 tests

### Failing Tests

**3 smoke tests fail when server is not running:**

| Test | Error | Fix |
|------|-------|-----|
| `health check returns 200` | `ECONNREFUSED localhost:4000` | Start server with `npm run dev` |
| `webhook returns 401 on bad signature` | `ECONNREFUSED localhost:4000` | Start server with `npm run dev` |
| `full customer flow` | `ECONNREFUSED localhost:4000` | Start server with `npm run dev` |

**2 catalog tests fail due to incomplete mocks:**

| Test | Error | Fix |
|------|-------|-----|
| `createVariant > creates variant with correct product relation` | `Product not found` | Add missing `product.findUnique` mock |
| `updateVariant > updates variant fields` | `Variant not found` | Add missing `productVariant.findUnique` mock |

## Fixing the 5 Failing Tests

### If Running Without Server (Default)

The smoke tests require a running server. To skip them:

```bash
npm test -- --exclude=tests/smoke.test.ts
```

Or run only unit tests:

```bash
npx vitest run tests/unit
```

### If Running With Server

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Ensure database is ready:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

3. **Run all tests:**
   ```bash
   npm test
   ```

### Fixing Catalog Service Mocks

The failing `createVariant` and `updateVariant` tests need additional mocks:

**In `tests/unit/catalog.service.test.ts`, add to `beforeEach`:**

For `createVariant` test (around line 151), add `product.findUnique` mock:
```typescript
vi.mocked(mockedPrisma.product.findUnique).mockResolvedValue({
  id: "prod-1",
  tenantId: "tenant-1",
});
```

For `updateVariant` test (around line 177), add `productVariant.findUnique` mock:
```typescript
vi.mocked(mockedPrisma.productVariant.findUnique).mockResolvedValue({
  id: "var-1",
  productId: "prod-1",
  product: { id: "prod-1", tenantId: "tenant-1" },
  sku: "SKU-001",
  name: "Variant A",
  price: 50,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

## Coverage

Run with coverage:

```bash
npx vitest run --coverage
```

Current thresholds in `vitest.config.ts`:
- Lines: 80%
- Functions: 80%
- Branches: 70%
