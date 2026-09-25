/**
 * Unit tests for credit-rating-tool.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchCreditRatings,
  formatCreditRatingsMarkdown,
  type CreditRatingResult,
} from "@/lib/ai/tools/credit-rating-tool";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("credit-rating-tool", () => {
  it("never fabricates a credit rating when exchange disclosures are not found", async () => {
    // All fetch calls return empty or 404
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ Table: [] }),
    });

    const result = await fetchCreditRatings("UNKNOWN_CO");

    expect(result.isLiveData).toBe(false);
    expect(result.ratings).toHaveLength(0);
    expect(result.overallCreditProfile).toContain("not publicly available");
  });

  it("parses exchange announcements containing real ratings and derives credit profile", async () => {
    // 1. BSE filings API mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Table: [
          {
            CATEGORYNAME: "Company Update / Rating",
            HEADLINE: "CRISIL Reaffirms AAA/Stable Rating for Long Term Bank Facilities",
            ATTACHMENTNAME: "12345.pdf",
            NEWS_DT: "2024-03-15",
          },
          {
            CATEGORYNAME: "Company Update / Rating",
            HEADLINE: "ICRA Upgrades rating to AA+/Positive from AA",
            ATTACHMENTNAME: "67890.pdf",
            NEWS_DT: "2024-02-10",
          },
        ],
      }),
    });

    // 2. NSE filings API mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    // 3. Search fallback mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html></html>",
    });

    const result = await fetchCreditRatings("RELIANCE");

    expect(result.isLiveData).toBe(true);
    expect(result.ratings.length).toBeGreaterThanOrEqual(1);

    const crisil = result.ratings.find((r) => r.agency === "CRISIL");
    expect(crisil).toBeDefined();
    expect(crisil?.rating).toBe("AAA/Stable");
    expect(crisil?.action).toBe("reaffirmed");

    expect(result.overallCreditProfile).toContain("Highest Safety (AAA)");
  });

  it("formats markdown correctly for empty profile with warning", () => {
    const emptyResult: CreditRatingResult = {
      ticker: "TCS",
      ratings: [],
      overallCreditProfile: "Not available",
      isLiveData: false,
      fetchedAt: "2026-09-25T12:00:00.000Z",
    };

    const md = formatCreditRatingsMarkdown(emptyResult);
    expect(md).toContain("No public credit rating disclosures found");
    expect(md).toContain("TCS");
  });

  it("formats markdown table and rationales when live ratings exist", () => {
    const liveResult: CreditRatingResult = {
      ticker: "INFY",
      ratings: [
        {
          agency: "CRISIL",
          rating: "AAA/Stable",
          instrument: "Long Term Debt",
          action: "reaffirmed",
          ratingDate: "2024-04-01",
          keyRationale: ["Strong cash reserves", "Industry leading margins"],
          source: "https://bseindia.com/rating.pdf",
        },
      ],
      overallCreditProfile: "Highest Safety (AAA)",
      isLiveData: true,
      fetchedAt: "2026-09-25T12:00:00.000Z",
    };

    const md = formatCreditRatingsMarkdown(liveResult);
    expect(md).toContain("| **CRISIL** | `AAA/Stable` |");
    expect(md).toContain("Highest Safety (AAA)");
    expect(md).toContain("Live (BSE/NSE Exchange Disclosures)");
    expect(md).toContain("Strong cash reserves");
  });
});
