/**
 * Unit tests for the NSE/BSE trading-session freshness primitive.
 *
 * Freshness is measured in elapsed trading sessions rather than wall-clock hours,
 * because a 24-hour rule is wrong in both directions for Indian markets: it calls
 * a Friday-evening price stale on Saturday morning, and calls a Tuesday-morning
 * price fresh on Wednesday afternoon.
 */

import { describe, it, expect } from "vitest";
import {
  istTradingDate,
  isIstWeekend,
  isRegularTradingSession,
  isTradingDay,
  assessMarketFreshness,
  parseHolidayList,
  holidaysFromEnv,
  NO_HOLIDAYS,
  IST_OFFSET_MINUTES,
} from "@/lib/market/india-trading-calendar";

/** Builds an instant from an IST wall-clock reading. */
function ist(y: number, m: number, d: number, hh = 10, mm = 0): Date {
  // IST is a fixed +05:30 offset with no DST.
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) - IST_OFFSET_MINUTES * 60_000);
}

describe("IST calendar helpers", () => {
  it("resolves the IST trading date correctly across the UTC day boundary", () => {
    // 2026-03-12 23:30 UTC is already 2026-03-13 05:00 IST.
    expect(istTradingDate(new Date(Date.UTC(2026, 2, 12, 23, 30)))).toBe("2026-03-13");
    // 2026-03-12 18:30 UTC is still 2026-03-13 00:00 IST exactly.
    expect(istTradingDate(new Date(Date.UTC(2026, 2, 12, 18, 29)))).toBe("2026-03-12");
  });

  it("identifies IST weekends", () => {
    // 2026-03-14 is a Saturday, 2026-03-15 a Sunday, 2026-03-16 a Monday.
    expect(isIstWeekend(ist(2026, 3, 14))).toBe(true);
    expect(isIstWeekend(ist(2026, 3, 15))).toBe(true);
    expect(isIstWeekend(ist(2026, 3, 16))).toBe(false);
  });

  it("recognises the 09:15-15:30 IST cash-market session", () => {
    // 2026-03-16 is a Monday.
    expect(isRegularTradingSession(ist(2026, 3, 16, 9, 14))).toBe(false);
    expect(isRegularTradingSession(ist(2026, 3, 16, 9, 15))).toBe(true);
    expect(isRegularTradingSession(ist(2026, 3, 16, 12, 0))).toBe(true);
    expect(isRegularTradingSession(ist(2026, 3, 16, 15, 30))).toBe(false);
    // A Saturday inside session hours is still not a session.
    expect(isRegularTradingSession(ist(2026, 3, 14, 12, 0))).toBe(false);
  });

  it("honours an injected holiday set", () => {
    const holidays = parseHolidayList("2026-03-16, 2026-03-17");
    expect(isTradingDay(ist(2026, 3, 16), holidays)).toBe(false);
    expect(isTradingDay(ist(2026, 3, 17), holidays)).toBe(false);
    expect(isTradingDay(ist(2026, 3, 18), holidays)).toBe(true);
  });

  it("parses holiday lists defensively", () => {
    expect(parseHolidayList("").size).toBe(0);
    expect(parseHolidayList(null).size).toBe(0);
    expect(parseHolidayList(undefined)).toBe(NO_HOLIDAYS);
    // Malformed entries are ignored rather than silently widening the set.
    expect([...parseHolidayList("2026-01-01, garbage, 20-2-2026, 2026-12-25")]).toEqual([
      "2026-01-01",
      "2026-12-25",
    ]);
    expect([...parseHolidayList("2026-01-01;2026-01-02\n2026-01-03")]).toHaveLength(3);
  });

  it("reads the holiday calendar from the environment", () => {
    const set = holidaysFromEnv({ NSE_HOLIDAYS: "2026-04-01" });
    expect(set.has("2026-04-01")).toBe(true);
    expect(holidaysFromEnv({}).size).toBe(0);
  });
});

describe("assessMarketFreshness — unknown timestamps must never read as fresh", () => {
  it("reports an absent timestamp as unknown and stale", () => {
    const f = assessMarketFreshness(null, ist(2026, 3, 16, 12));
    expect(f.timestampKnown).toBe(false);
    expect(f.isCurrentSession).toBe(false);
    expect(f.isStale).toBe(true);
    expect(f.sessionsElapsed).toBeNull();
    expect(f.summary).toMatch(/cannot be established/i);
  });

  it("reports an unparseable timestamp as unknown and stale", () => {
    const f = assessMarketFreshness("not-a-date", ist(2026, 3, 16, 12));
    expect(f.timestampKnown).toBe(false);
    expect(f.isStale).toBe(true);
    expect(f.summary).toMatch(/not a valid date/i);
  });

  it("never substitutes the current time for a missing timestamp", () => {
    // This is the specific behaviour that let the freshness check pass permanently:
    // the caller used to backfill `fetchedAt ?? new Date()`.
    const f = assessMarketFreshness(undefined, ist(2026, 3, 16, 12));
    expect(f.ageHours).toBeNull();
    expect(f.isStale).toBe(true);
  });
});

describe("assessMarketFreshness — session counting", () => {
  it("treats a fetch earlier the same session as current", () => {
    const now = ist(2026, 3, 16, 15, 0);
    const f = assessMarketFreshness(ist(2026, 3, 16, 10, 0).toISOString(), now);
    expect(f.sessionsElapsed).toBe(0);
    expect(f.isCurrentSession).toBe(true);
    expect(f.isStale).toBe(false);
    expect(f.ageHours).toBeCloseTo(5, 1);
  });

  it("keeps a Friday-evening fetch current across the weekend", () => {
    // Fetched Friday 2026-03-13 18:00 IST, read Monday 2026-03-16 09:30 IST.
    const f = assessMarketFreshness(
      ist(2026, 3, 13, 18, 0).toISOString(),
      ist(2026, 3, 16, 9, 30),
    );
    // 52.5 wall-clock hours, but zero elapsed trading sessions: Sat and Sun are not
    // sessions. A 24-hour rule would have called this stale.
    expect(f.sessionsElapsed).toBe(0);
    expect(f.isCurrentSession).toBe(true);
    expect(f.ageHours).toBeGreaterThan(48);
  });

  it("counts one elapsed session for an overnight gap", () => {
    // Fetched Tuesday 2026-03-17 15:00 IST, read Wednesday 2026-03-18 11:00 IST.
    const f = assessMarketFreshness(
      ist(2026, 3, 17, 15, 0).toISOString(),
      ist(2026, 3, 18, 11, 0),
    );
    expect(f.sessionsElapsed).toBe(1);
    expect(f.isCurrentSession).toBe(false);
    expect(f.isStale).toBe(true);
    // 20 wall-clock hours — comfortably inside a 24-hour rule, yet stale.
    expect(f.ageHours).toBeLessThan(24);
  });

  it("counts a full week correctly", () => {
    const f = assessMarketFreshness(
      ist(2026, 3, 9, 12, 0).toISOString(), // Monday
      ist(2026, 3, 16, 12, 0), // following Monday
    );
    expect(f.sessionsElapsed).toBe(5);
    expect(f.isStale).toBe(true);
  });

  it("excludes injected holidays from the session count", () => {
    const holidays = parseHolidayList("2026-03-17,2026-03-18");
    const now = ist(2026, 3, 19, 12, 0); // Thursday
    const withoutCalendar = assessMarketFreshness(
      ist(2026, 3, 16, 15, 0).toISOString(), // Monday close
      now,
    );
    const withCalendar = assessMarketFreshness(
      ist(2026, 3, 16, 15, 0).toISOString(),
      now,
      holidays,
    );
    expect(withoutCalendar.sessionsElapsed).toBe(3);
    expect(withCalendar.sessionsElapsed).toBe(1);
    expect(withCalendar.holidaysAccountedFor).toBe(true);
    expect(withoutCalendar.holidaysAccountedFor).toBe(false);
  });

  it("discloses when no holiday calendar was supplied", () => {
    const f = assessMarketFreshness(
      ist(2026, 3, 16, 12, 0).toISOString(),
      ist(2026, 3, 16, 13, 0),
    );
    expect(f.holidaysAccountedFor).toBe(false);
    expect(f.summary).toMatch(/holiday calendar not supplied/i);
  });

  it("does not report a negative age for a future-dated source", () => {
    const f = assessMarketFreshness(
      ist(2026, 3, 16, 15, 0).toISOString(), // in the future
      ist(2026, 3, 16, 12, 0),
    );
    expect(f.sessionsElapsed).toBe(0);
    expect(f.isCurrentSession).toBe(true);
    // Flagged rather than silently trusted, because clock skew usually means the
    // source is not actually the authority it claims to be.
    expect(f.summary).toMatch(/FUTURE/i);
    expect(f.summary).toMatch(/clock skew/i);
  });

  it("terminates on a pathological timestamp", () => {
    const f = assessMarketFreshness("1990-01-01T00:00:00.000Z", ist(2026, 3, 16, 12));
    expect(f.timestampKnown).toBe(true);
    expect(f.isStale).toBe(true);
    // Bounded by MAX_SESSIONS rather than looping forever.
    expect(f.sessionsElapsed).toBeLessThanOrEqual(750);
  });
});
