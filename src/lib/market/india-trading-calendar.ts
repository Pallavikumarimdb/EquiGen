/**
 * NSE/BSE trading-session calendar.
 *
 * Freshness for Indian market data cannot be measured in wall-clock hours.
 * NSE and BSE trade 09:15–15:30 IST, Monday to Friday, excluding exchange
 * holidays. A price series fetched Friday 18:00 IST is perfectly current when
 * read Monday 09:30 IST, yet a naive 24-hour rule would already have called it
 * stale on Saturday morning. Conversely a price read Tuesday 11:00 and presented
 * Wednesday 16:00 IS stale, and a 24-hour rule would not notice until Thursday.
 *
 * Counting elapsed *trading sessions* gets both cases right.
 *
 * HONESTY NOTE ON HOLIDAYS
 * -----------------------
 * Exchange holidays are not derivable from a formula — NSE publishes and revises
 * them annually, and they change at short notice. Rather than embed a list that
 * silently goes stale (and would then over-report staleness on a trading day),
 * this module takes the holiday set as an injected input. Callers should load it
 * from the exchange calendar; when no calendar is supplied the module counts
 * weekends only and reports `holidaysAccountedFor: false` so a consumer can
 * disclose that a Diwali week may look fresh when it is not.
 */

/** All timestamps are handled in this zone. IST is a fixed +05:30 offset, no DST. */
export const IST_OFFSET_MINUTES = 330;

export interface IstParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** `YYYY-MM-DD` in IST */
  isoDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Splits an instant into Indian Standard Time calendar parts. */
export function toIstParts(instant: Date = new Date()): IstParts {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  const valid = !isNaN(shifted.getTime());
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
    // `toISOString` throws on an invalid date; an unparseable source timestamp must
    // degrade to a null-ish sentinel here rather than taking down the whole audit.
    isoDate: valid ? shifted.toISOString().slice(0, 10) : "",
  };
}

/** `YYYY-MM-DD` for an instant, in IST. This is how exchanges key a session. */
export function istTradingDate(instant: Date = new Date()): string {
  return toIstParts(instant).isoDate;
}

/** True for Saturday and Sunday in IST. */
export function isIstWeekend(instant: Date): boolean {
  const w = toIstParts(instant).weekday;
  return w === 0 || w === 6;
}

/** Regular NSE/BSE cash-market session: 09:15–15:30 IST, Mon–Fri. */
export function isRegularTradingSession(instant: Date = new Date()): boolean {
  const p = toIstParts(instant);
  if (p.weekday === 0 || p.weekday === 6) return false;
  const minutes = p.hour * 60 + p.minute;
  const OPEN = 9 * 60 + 15;
  const CLOSE = 15 * 60 + 30;
  return minutes >= OPEN && minutes < CLOSE;
}

/** Exchange holidays as `YYYY-MM-DD` IST dates. Inject from the NSE calendar. */
export type HolidaySet = ReadonlySet<string>;

export const NO_HOLIDAYS: HolidaySet = new Set<string>();

/** True when the IST calendar date is a trading day under the supplied calendar. */
export function isTradingDay(instant: Date, holidays: HolidaySet = NO_HOLIDAYS): boolean {
  const p = toIstParts(instant);
  if (p.weekday === 0 || p.weekday === 6) return false;
  return !holidays.has(p.isoDate);
}

export interface FreshnessAssessment {
  /** Data age measured in elapsed trading sessions. 0 means the current session. */
  sessionsElapsed: number | null;
  /** Wall-clock age in hours, for display only. */
  ageHours: number | null;
  /** True when the data belongs to the currently open or most recent session. */
  isCurrentSession: boolean;
  /** True when the data is older than the most recently closed session. */
  isStale: boolean;
  /** False when no timestamp was recorded at all. */
  timestampKnown: boolean;
  /** False when the caller supplied no holiday calendar (weekends only). */
  holidaysAccountedFor: boolean;
  /** Human-readable summary suitable for an audit message. */
  summary: string;
}

/**
 * Measures how stale a market datum is, in trading sessions rather than hours.
 *
 * Returns `timestampKnown: false` when `fetchedAt` is absent or unparseable. It
 * never substitutes the current time: an unknown fetch time must read as unknown,
 * because defaulting it to "now" is exactly how stale data ends up being certified
 * as current.
 *
 * DEFINITION OF "STALE"
 * ---------------------
 * `sessionsElapsed` counts NSE/BSE sessions that had CLOSED between the fetch and
 * now, and whose close the fetch could not have captured. A datum is current when
 * it covers the most recently completed session.
 *
 * This is what makes the two interesting cases come out right:
 *   - Fetched Friday 18:00 IST, read Monday 09:30 IST -> 0 sessions. Friday's
 *     close IS Monday morning's reference price, so it is current. A 24-hour rule
 *     would already have called it stale on Saturday.
 *   - Fetched Tuesday 15:00 IST, read Wednesday 11:00 IST -> 1 session. Tuesday's
 *     close happened after the fetch, so the datum predates the reference price a
 *     Wednesday reader would act on. A 24-hour rule would not notice for another
 *     six hours, well past its threshold.
 */
export function assessMarketFreshness(
  fetchedAt: string | null | undefined,
  now: Date = new Date(),
  holidays: HolidaySet = NO_HOLIDAYS,
): FreshnessAssessment {
  const holidaysAccountedFor = holidays.size > 0;
  const caveat = holidaysAccountedFor
    ? ""
    : " (weekends excluded; exchange holiday calendar not supplied)";

  if (!fetchedAt) {
    return {
      sessionsElapsed: null,
      ageHours: null,
      isCurrentSession: false,
      isStale: true,
      timestampKnown: false,
      holidaysAccountedFor,
      summary:
        "No fetch timestamp was recorded for this data, so its age cannot be established." +
        caveat,
    };
  }

  const fetched = new Date(fetchedAt);
  if (isNaN(fetched.getTime())) {
    return {
      sessionsElapsed: null,
      ageHours: null,
      isCurrentSession: false,
      isStale: true,
      timestampKnown: false,
      holidaysAccountedFor,
      summary:
        `Fetch timestamp "${fetchedAt}" is not a valid date, so the data's age cannot be established.` +
        caveat,
    };
  }

  const ageMs = now.getTime() - fetched.getTime();
  const ageHours = Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10;

  // A clock skew or a future-dated source would otherwise report a negative age
  // and read as maximally fresh.
  if (ageMs < 0) {
    return {
      sessionsElapsed: 0,
      ageHours,
      isCurrentSession: true,
      isStale: false,
      timestampKnown: true,
      holidaysAccountedFor,
      summary:
        `Fetch timestamp is ${Math.abs(ageHours)}h in the FUTURE relative to server time, which is ` +
        `usually clock skew on the source. Treated as current; verify the source clock.${caveat}`,
    };
  }

  // Walk IST CALENDAR days from the fetch date forward. Stepping by a fixed 24h of
  // wall time would drift across the IST boundary and miscount, which is precisely
  // the class of bug this function exists to remove.
  const sessionsElapsed = countClosedSessionsAfter(fetched, now, holidays);
  const isCurrentSession = sessionsElapsed === 0;
  const isStale = !isCurrentSession;

  const summary = isCurrentSession
    ? `Current trading session (${sessionsElapsed} session(s) elapsed, ${ageHours}h wall clock).${caveat}`
    : `STALE: ${sessionsElapsed} trading session(s) elapsed since fetch ` +
      `(${ageHours}h wall clock).${caveat}`;

  return {
    sessionsElapsed,
    ageHours,
    isCurrentSession,
    isStale,
    timestampKnown: true,
    holidaysAccountedFor,
    summary,
  };
}

/** Hard stop so a malformed far-past timestamp cannot spin forever. */
const MAX_SESSION_SCAN_DAYS = 750;

/** Regular cash-market close, minutes past IST midnight. */
const SESSION_CLOSE_MINUTES = 15 * 60 + 30;

function sessionCloseUtc(istDate: string): number {
  const [y, m, d] = istDate.split("-").map((n) => parseInt(n, 10));
  return Date.UTC(y, m - 1, d, 0, SESSION_CLOSE_MINUTES, 0, 0) - IST_OFFSET_MINUTES * 60_000;
}

function nextIstDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((n) => parseInt(n, 10));
  // Stepping through Date.UTC and re-reading the calendar fields keeps the walk on
  // IST dates regardless of month length.
  const next = new Date(Date.UTC(y, m - 1, d) + DAY_MS);
  return next.toISOString().slice(0, 10);
}

/**
 * Counts sessions that closed after `fetched` and at or before `now`.
 *
 * A session counts when:
 *   - its IST date is a trading day, and
 *   - its 15:30 IST close is strictly AFTER the fetch instant (so the fetch could
 *     not have contained it), and
 *   - its close is at or before now.
 */
function countClosedSessionsAfter(
  fetched: Date,
  now: Date,
  holidays: HolidaySet,
): number {
  let cursor = istTradingDate(fetched);
  let counted = 0;

  for (let i = 0; i < MAX_SESSION_SCAN_DAYS; i++) {
    const close = sessionCloseUtc(cursor);
    if (close > now.getTime()) break;
    if (isTradingDay(new Date(close + IST_OFFSET_MINUTES * 60_000), holidays) && close > fetched.getTime()) {
      counted++;
    }
    cursor = nextIstDate(cursor);
  }

  return counted;
}

/**
 * Parses a comma/newline separated holiday list into a `HolidaySet`.
 *
 * Expected format: `YYYY-MM-DD` entries separated by commas, semicolons or
 * newlines. Blank and malformed entries are ignored rather than silently widening
 * the set.
 */
export function parseHolidayList(raw: string | null | undefined): HolidaySet {
  if (!raw) return NO_HOLIDAYS;
  const set = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const token = part.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) set.add(token);
  }
  return set;
}

/** Reads the optional holiday calendar from the environment. */
export function holidaysFromEnv(
  env: Record<string, string | undefined> = process.env,
): HolidaySet {
  return parseHolidayList(env.NSE_HOLIDAYS ?? env.EQUIGEN_NSE_HOLIDAYS);
}
