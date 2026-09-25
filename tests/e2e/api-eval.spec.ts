import { test, expect } from "@playwright/test";

test.describe("API & Eval Engine E2E", () => {
  test("GET /api/eval/run returns 400 when ticker is missing", async ({ request }) => {
    const response = await request.get("/api/eval/run");
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Missing required query param: ticker");
  });

  test("GET /api/eval/run returns 404 when ticker has no stored run", async ({ request }) => {
    const response = await request.get("/api/eval/run?ticker=NONEXISTENT_TICKER_999");
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.error).toContain("No agent run found");
  });

  test("GET /api/history returns 200 with history list", async ({ request }) => {
    const response = await request.get("/api/history");
    expect(response.status()).toBe(200);
  });
});
