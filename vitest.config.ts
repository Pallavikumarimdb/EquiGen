// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Alias @/* → src/* so tests can import @/lib/... directly
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Centralized unit tests in tests/unit/
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules", ".next"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/db.ts", "tests/**"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
      },
    },
    // Timeout: network-calling tests use mocks so should be fast
    testTimeout: 10000,
    // Pool: fork for test isolation (avoids global state bleed between tool tests)
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
