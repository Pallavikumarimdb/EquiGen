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
    // `src/lib/db.ts` now refuses to construct a connection pool without DATABASE_URL
    // rather than defaulting to a hardcoded local DSN. Unit tests mock `@/lib/db`
    // where they touch it, but a few import modules that transitively import the real
    // module and only assert non-database behaviour. Those need a syntactically valid
    // placeholder; no connection is attempted because the pool is lazy and the tests
    // never query it.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/equigen_test",
      // Likewise required by src/lib/utils/api-keys.ts; never used by unit tests, which
      // mock that module.
      ENCRYPTION_KEY:
        process.env.ENCRYPTION_KEY ?? "0".repeat(64),
      JWT_SECRET:
        process.env.JWT_SECRET ??
        "unit-test-jwt-secret-at-least-32-characters-long",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
