import type { TestFn } from "vitest";

declare global {
  const describe: TestFn["describe"];
  const it: TestFn["it"];
  const test: TestFn["test"];
  const expect: typeof import("vitest/expect").expect;
  const beforeAll: TestFn["beforeAll"];
  const afterAll: TestFn["afterAll"];
  const beforeEach: TestFn["beforeEach"];
  const afterEach: TestFn["afterEach"];
}
