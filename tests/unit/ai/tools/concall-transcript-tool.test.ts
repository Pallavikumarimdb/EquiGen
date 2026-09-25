/**
 * Unit tests for concall-transcript-tool.ts (RC-5 BSE filing transcripts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchConcallTranscript,
  formatConcallQuotesMarkdown,
  type ConcallTranscriptResult,
  type ConcallQuote,
} from "@/lib/ai/tools/concall-transcript-tool";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("concall-transcript-tool", () => {
  it("formats markdown correctly when quotes are present", () => {
    const quotes: ConcallQuote[] = [
      {
        quarter: "Q3 FY25",
        speakerRole: "CEO",
        speakerName: "John Doe",
        quote: "We anticipate 15-18% revenue growth driven by cloud adoption.",
        topic: "revenue_guidance",
        sentiment: "positive",
      },
      {
        quarter: "Q3 FY25",
        speakerRole: "CFO",
        speakerName: "Jane Smith",
        quote: "Operating margins will remain stable within 24-25% range.",
        topic: "margin_guidance",
        sentiment: "neutral",
      },
    ];

    const result: ConcallTranscriptResult = {
      ticker: "INFY",
      quarter: "Q3 FY25",
      transcriptText: "Transcript sample text...",
      quotes,
      sourceUrl: "https://www.bseindia.com/filing/123.pdf",
      fetchedAt: "2026-09-25T10:00:00.000Z",
    };

    const md = formatConcallQuotesMarkdown(result);

    expect(md).toContain("## Management Q&A Highlights — INFY (Q3 FY25)");
    expect(md).toContain("📈 Revenue Guidance");
    expect(md).toContain("> **CEO (John Doe):** \"We anticipate 15-18% revenue growth driven by cloud adoption.\"");
    expect(md).toContain("📊 Margin Outlook");
    expect(md).toContain("> **CFO (Jane Smith):** \"Operating margins will remain stable within 24-25% range.\"");
    expect(md).toContain("[BSE India Announcements]");
  });

  it("formats markdown empty message when no quotes are available", () => {
    const result: ConcallTranscriptResult = {
      ticker: "TCS",
      quarter: "Q2 FY25",
      transcriptText: "",
      quotes: [],
      sourceUrl: "https://www.bseindia.com/filing/empty",
      fetchedAt: "2026-09-25T10:00:00.000Z",
    };

    const md = formatConcallQuotesMarkdown(result);

    expect(md).toContain("No transcript data available.");
    expect(md).toContain("TCS (Q2 FY25)");
  });

  it("handles empty or failed BSE announcement lookup safely", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const res = await fetchConcallTranscript("UNKNOWN_TICKER");
    expect(res.ticker).toBe("UNKNOWN_TICKER");
    expect(res.quotes).toHaveLength(0);
    expect(res.transcriptText).toBe("");
  });
});
