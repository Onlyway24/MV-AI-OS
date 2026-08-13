export const ONLYWAY_BUSINESS_TIME_ZONE = "Europe/Rome" as const;

export type OnlywayBusinessTimeZone = typeof ONLYWAY_BUSINESS_TIME_ZONE;

export interface BusinessClockTime {
  readonly hour: number;
  readonly minute: number;
}

export interface BusinessDayWindow {
  readonly endsAt: string;
  readonly startsAt: string;
}

const MINUTE_MS = 60_000;
const SEARCH_WINDOW_MINUTES = 6 * 60;
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const formatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: ONLYWAY_BUSINESS_TIME_ZONE,
  year: "numeric",
});

interface LocalDateTimeParts extends BusinessClockTime {
  readonly businessDate: string;
  readonly second: number;
}

/** Canonical calendar-date validation shared by all Onlyway daily consumers. */
export function isBusinessDate(value: unknown): value is string {
  if (typeof value !== "string" || !BUSINESS_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Returns the Europe/Rome business date containing an absolute instant. */
export function businessDateAt(
  instant: Date | string,
  timeZone: OnlywayBusinessTimeZone = ONLYWAY_BUSINESS_TIME_ZONE,
): string {
  assertTimeZone(timeZone);
  return localParts(instant).businessDate;
}

/** Returns the Europe/Rome wall-clock hour and minute containing an instant. */
export function businessClockTimeAt(
  instant: Date | string,
  timeZone: OnlywayBusinessTimeZone = ONLYWAY_BUSINESS_TIME_ZONE,
): BusinessClockTime {
  assertTimeZone(timeZone);
  const { hour, minute } = localParts(instant);
  return Object.freeze({ hour, minute });
}

/**
 * Resolves one local calendar minute to an absolute instant. During the autumn
 * overlap the earlier occurrence wins. During the spring gap the first valid
 * minute after the requested wall time wins.
 */
export function calendarDailyOccurrenceAt(
  businessDate: string,
  time: BusinessClockTime,
  timeZone: OnlywayBusinessTimeZone = ONLYWAY_BUSINESS_TIME_ZONE,
): string {
  assertTimeZone(timeZone);
  if (!isBusinessDate(businessDate) || !validClockTime(time)) throw new RangeError("Business calendar occurrence is invalid");
  const [year = 0, month = 0, day = 0] = businessDate.split("-").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, time.hour, time.minute);
  const targetMinute = time.hour * 60 + time.minute;
  let firstValidAfterGap: number | undefined;

  for (let offset = -SEARCH_WINDOW_MINUTES; offset <= SEARCH_WINDOW_MINUTES; offset += 1) {
    const candidate = naiveUtc + offset * MINUTE_MS;
    const parts = localParts(new Date(candidate));
    if (parts.businessDate !== businessDate || parts.second !== 0) continue;
    const localMinute = parts.hour * 60 + parts.minute;
    if (localMinute === targetMinute) return new Date(candidate).toISOString();
    if (localMinute > targetMinute && firstValidAfterGap === undefined) firstValidAfterGap = candidate;
  }

  if (firstValidAfterGap !== undefined) return new Date(firstValidAfterGap).toISOString();
  throw new RangeError("Business calendar occurrence cannot be resolved");
}

/** Absolute half-open Europe/Rome window for one canonical business date. */
export function businessDayWindow(
  businessDate: string,
  timeZone: OnlywayBusinessTimeZone = ONLYWAY_BUSINESS_TIME_ZONE,
): BusinessDayWindow {
  assertTimeZone(timeZone);
  if (!isBusinessDate(businessDate)) throw new RangeError("Business calendar date is invalid");
  return Object.freeze({
    endsAt: calendarDailyOccurrenceAt(addBusinessDays(businessDate, 1), { hour: 0, minute: 0 }, timeZone),
    startsAt: calendarDailyOccurrenceAt(businessDate, { hour: 0, minute: 0 }, timeZone),
  });
}

/** Finds the first daily wall-clock occurrence strictly after `after`. */
export function nextCalendarDailyOccurrence(
  currentOccurrence: string,
  after: string,
  time: BusinessClockTime,
  timeZone: OnlywayBusinessTimeZone = ONLYWAY_BUSINESS_TIME_ZONE,
): string {
  assertTimeZone(timeZone);
  const current = instant(currentOccurrence);
  const boundary = instant(after);
  let candidateDate = addBusinessDays(businessDateAt(current, timeZone), 1);
  const boundaryDate = businessDateAt(boundary, timeZone);
  if (candidateDate < boundaryDate) candidateDate = boundaryDate;
  let candidate = calendarDailyOccurrenceAt(candidateDate, time, timeZone);
  if (Date.parse(candidate) <= boundary.getTime()) {
    candidateDate = addBusinessDays(candidateDate, 1);
    candidate = calendarDailyOccurrenceAt(candidateDate, time, timeZone);
  }
  return candidate;
}

function addBusinessDays(value: string, days: number): string {
  if (!isBusinessDate(value) || !Number.isSafeInteger(days)) throw new RangeError("Business date arithmetic is invalid");
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assertTimeZone(value: string): asserts value is OnlywayBusinessTimeZone {
  if (value !== ONLYWAY_BUSINESS_TIME_ZONE) throw new RangeError("Onlyway business time zone is invalid");
}

function instant(value: Date | string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new RangeError("Business calendar instant is invalid");
  return parsed;
}

function localParts(value: Date | string): LocalDateTimeParts {
  const parts = new Map(formatter.formatToParts(instant(value)).map(({ type, value: part }) => [type, part]));
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));
  const second = Number(parts.get("second"));
  if (year === undefined || month === undefined || day === undefined || !Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) throw new RangeError("Business calendar formatting failed");
  return { businessDate: `${year}-${month}-${day}`, hour, minute, second };
}

function validClockTime(value: BusinessClockTime): boolean {
  return Number.isSafeInteger(value.hour) && value.hour >= 0 && value.hour <= 23
    && Number.isSafeInteger(value.minute) && value.minute >= 0 && value.minute <= 59;
}
