import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@lib": path.resolve(__dirname, "./src/lib"),
      "@modules": path.resolve(__dirname, "./src/modules"),
      "@graphql": path.resolve(__dirname, "./src/graphql"),
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
  coverage: {
    provider: "v8",
    thresholds: {
      lines: 80,
      functions: 80,
      branches: 70,
    },
  },
});
