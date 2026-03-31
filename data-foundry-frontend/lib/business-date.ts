import type { BusinessDateRange, BusinessDateFrequency } from "@/lib/types";

export const OPEN_ENDED_PREVIEW_PERIODS = 6;

const FULL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/i;
const YEAR_PATTERN = /^(\d{4})$/;

export function extractBusinessDateYear(value: string): string | null {
  const matched = String(value).match(/^(\d{4})/);
  if (!matched) {
    return null;
  }
  const year = matched[1];
  return /^\d{4}$/.test(year) ? year : null;
}

export function extractBusinessDateMonth(value: string): number | null {
  const matched = String(value).match(/^\d{4}-(\d{2})/);
  if (!matched) {
    return null;
  }
  const month = Number(matched[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return month;
}

export function pickDefaultBusinessYear(
  availableYears: string[],
  options: {
    now?: Date;
  } = {},
): string {
  if (availableYears.length === 0) {
    return "";
  }

  const nowYear = String((options.now ?? new Date()).getFullYear());
  if (availableYears.includes(nowYear)) {
    return nowYear;
  }

  const nearestPast = availableYears
    .filter((year) => year <= nowYear)
    .sort((a, b) => b.localeCompare(a))[0];
  return nearestPast ?? availableYears[0];
}

export function limitFutureBusinessDates(
  businessDates: string[],
  options: {
    now?: Date;
    maxFuturePeriods?: number;
  } = {},
): string[] {
  const maxFuturePeriods = Math.max(options.maxFuturePeriods ?? 1, 0);
  if (businessDates.length === 0 || maxFuturePeriods === 0) {
    return businessDates.filter((dateText) => {
      const parsed = parseBusinessDate(dateText);
      return parsed != null;
    });
  }

  const todayKey = formatBusinessDate(options.now ?? new Date());
  const normalized = businessDates.filter((dateText) => parseBusinessDate(dateText) != null);
  const futureDates = normalized
    .filter((dateText) => dateText > todayKey)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const allowedFuture = new Set(futureDates.slice(0, maxFuturePeriods));

  return businessDates.filter((dateText) => dateText <= todayKey || allowedFuture.has(dateText));
}

export function isOpenEndedBusinessDateRange(range: BusinessDateRange): boolean {
  return range.end === "never";
}

export function normalizeBusinessDateToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const fullDateMatch = trimmed.match(FULL_DATE_PATTERN);
  if (fullDateMatch) {
    const parsed = createValidatedUtcDate(
      Number(fullDateMatch[1]),
      Number(fullDateMatch[2]) - 1,
      Number(fullDateMatch[3]),
    );
    return parsed ? formatBusinessDate(parsed) : value;
  }

  const monthMatch = trimmed.match(MONTH_PATTERN);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const monthIndex = Number(monthMatch[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      return value;
    }
    const parsed = createUtcPeriodEnd(year, monthIndex + 1);
    return parsed ? formatBusinessDate(parsed) : value;
  }

  const quarterMatch = trimmed.match(QUARTER_PATTERN);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const quarter = Number(quarterMatch[2]);
    const parsed = createUtcPeriodEnd(year, quarter * 3);
    return parsed ? formatBusinessDate(parsed) : value;
  }

  const yearMatch = trimmed.match(YEAR_PATTERN);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const parsed = createUtcPeriodEnd(year + 1, 0);
    return parsed ? formatBusinessDate(parsed) : value;
  }

  return value;
}

export function parseBusinessDate(value: string): Date | null {
  const normalized = normalizeBusinessDateToken(value);
  const matched = normalized.match(FULL_DATE_PATTERN);
  if (!matched) {
    return null;
  }

  const [, year, month, day] = matched;
  return createValidatedUtcDate(Number(year), Number(month) - 1, Number(day));
}

export function formatBusinessDate(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function formatBusinessDateLabel(
  businessDate: string,
  frequency: BusinessDateFrequency,
): string {
  const normalized = normalizeBusinessDateToken(businessDate);
  const parsed = parseBusinessDate(normalized);
  if (!parsed) {
    return businessDate;
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;

  if (frequency === "monthly") {
    return `${year}年${month}月`;
  }

  if (frequency === "quarterly") {
    return `${year} Q${Math.floor((month - 1) / 3) + 1}`;
  }

  if (frequency === "yearly") {
    return `${year}年`;
  }

  return normalized;
}

export function addOffsetDays(dateText: string, offsetDays: number): string {
  const source = parseBusinessDate(dateText);
  if (!source) {
    return dateText;
  }

  const next = new Date(source);
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return formatBusinessDate(next);
}

export function buildBusinessDateSlots(
  range: BusinessDateRange,
  options: {
    referenceDate?: Date;
    openEndedFuturePeriods?: number;
  } = {},
): string[] {
  const start = parseBusinessDate(range.start);
  const end = resolveBusinessDateEnd(range, options);

  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }

  return buildFiniteBusinessDateSlots(start, end, range.frequency);
}

export function buildScheduleExamples(
  range: BusinessDateRange,
  offsetDays: number,
  options: {
    referenceDate?: Date;
    count?: number;
  } = {},
): Array<{ businessDate: string; scheduleDate: string }> {
  const referenceDate = options.referenceDate ?? new Date();
  const referenceKey = formatBusinessDate(toUtcDate(referenceDate));
  const count = options.count ?? 3;
  const businessDates = buildBusinessDateSlots(range, {
    referenceDate,
    openEndedFuturePeriods: Math.max(count + 2, OPEN_ENDED_PREVIEW_PERIODS),
  }).filter((date) => date >= referenceKey);

  return businessDates.slice(0, count).map((businessDate) => ({
    businessDate,
    scheduleDate: addOffsetDays(businessDate, offsetDays),
  }));
}

function resolveBusinessDateEnd(
  range: BusinessDateRange,
  options: {
    referenceDate?: Date;
    openEndedFuturePeriods?: number;
  },
): Date | null {
  if (!isOpenEndedBusinessDateRange(range)) {
    return parseBusinessDate(range.end);
  }

  const start = parseBusinessDate(range.start);
  if (!start) {
    return null;
  }

  const referenceDate = toUtcDate(options.referenceDate ?? new Date());
  const openEndedFuturePeriods = Math.max(options.openEndedFuturePeriods ?? OPEN_ENDED_PREVIEW_PERIODS, 0);
  const historicalSlots = buildFiniteBusinessDateSlots(
    start,
    referenceDate.getTime() >= start.getTime() ? referenceDate : start,
    range.frequency,
  );
  const seed = historicalSlots.length > 0
    ? parseBusinessDate(historicalSlots[historicalSlots.length - 1]) ?? start
    : start;

  return advanceBusinessDate(seed, range.frequency, openEndedFuturePeriods);
}

function toUtcDate(source: Date): Date {
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

function createValidatedUtcDate(year: number, monthIndex: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== monthIndex
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function createUtcPeriodEnd(year: number, monthIndex: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) {
    return null;
  }
  const parsed = new Date(Date.UTC(year, monthIndex, 0));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFiniteBusinessDateSlots(
  start: Date,
  end: Date,
  frequency: BusinessDateFrequency,
): string[] {
  if (frequency === "daily") {
    return buildDailyDateSlots(start, end);
  }

  if (frequency === "weekly") {
    return buildWeeklyDateSlots(start, end);
  }

  return buildPeriodEndDateSlots(start, end, frequency);
}

function buildDailyDateSlots(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatBusinessDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function buildWeeklyDateSlots(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    dates.push(formatBusinessDate(weekEnd.getTime() > end.getTime() ? end : weekEnd));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return Array.from(new Set(dates));
}

function buildPeriodEndDateSlots(
  start: Date,
  end: Date,
  frequency: Exclude<BusinessDateFrequency, "daily" | "weekly">,
): string[] {
  const dates: string[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (cursor.getTime() <= end.getTime()) {
    const periodEnd = getPeriodEnd(cursor, frequency);
    const candidate = periodEnd.getTime() > end.getTime() ? end : periodEnd;

    if (candidate.getTime() >= start.getTime()) {
      dates.push(formatBusinessDate(candidate));
    }

    if (frequency === "monthly") {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      continue;
    }

    if (frequency === "quarterly") {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1));
      continue;
    }

    cursor = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
  }

  return Array.from(new Set(dates));
}

function getPeriodEnd(
  date: Date,
  frequency: Exclude<BusinessDateFrequency, "daily" | "weekly">,
): Date {
  if (frequency === "monthly") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  }

  if (frequency === "quarterly") {
    const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth + 3, 0));
  }

  return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 0));
}

function advanceBusinessDate(
  seed: Date,
  frequency: BusinessDateFrequency,
  steps: number,
): Date {
  const next = new Date(seed);
  if (steps <= 0) {
    return next;
  }

  for (let index = 0; index < steps; index += 1) {
    if (frequency === "daily") {
      next.setUTCDate(next.getUTCDate() + 1);
      continue;
    }

    if (frequency === "weekly") {
      next.setUTCDate(next.getUTCDate() + 7);
      continue;
    }

    if (frequency === "monthly") {
      next.setTime(new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 2, 0)).getTime());
      continue;
    }

    if (frequency === "quarterly") {
      const quarterStartMonth = Math.floor(next.getUTCMonth() / 3) * 3;
      next.setTime(new Date(Date.UTC(next.getUTCFullYear(), quarterStartMonth + 6, 0)).getTime());
      continue;
    }

    next.setTime(new Date(Date.UTC(next.getUTCFullYear() + 2, 0, 0)).getTime());
  }

  return next;
}


/**
 * 将任意日期对齐到所属周期的最后一天。
 * - monthly  → 该月最后一天
 * - quarterly → 该季度最后一天
 * - yearly   → 该年最后一天 (12-31)
 * - daily / weekly → 原样返回
 */
export function snapToPeriodEnd(dateText: string, frequency: BusinessDateFrequency): string {
  const parsed = parseBusinessDate(dateText);
  if (!parsed) return dateText;
  if (frequency === "daily" || frequency === "weekly") return dateText;
  return formatBusinessDate(getPeriodEnd(parsed, frequency));
}

/**
 * 根据频率生成可选的业务日期列表（period-end dates），
 * 范围：从 rangeStart 所在周期 到 referenceDate 所在周期。
 * 用于 Demo 模式下限定用户可选范围。
 */
export function buildSelectableBusinessDates(
  frequency: BusinessDateFrequency,
  options: { referenceDate?: Date; lookbackYears?: number } = {},
): string[] {
  const ref = options.referenceDate ?? new Date();
  const lookback = options.lookbackYears ?? 5;
  const startYear = ref.getUTCFullYear() - lookback;
  const start = new Date(Date.UTC(startYear, 0, 1));
  // end = period-end of the reference date's period
  const refUtc = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const end = (frequency === "daily" || frequency === "weekly")
    ? refUtc
    : getPeriodEnd(refUtc, frequency);
  return buildFiniteBusinessDateSlots(start, end, frequency);
}

/**
 * Demo 模式下的默认"最近一期"日期范围。
 * 返回 { start, end } 都是同一个 period-end date。
 */
export function buildDemoDefaultDateRange(
  frequency: BusinessDateFrequency,
  referenceDate?: Date,
): { start: string; end: string } {
  const ref = referenceDate ?? new Date();
  const refUtc = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));

  if (frequency === "daily") {
    const d = formatBusinessDate(refUtc);
    return { start: d, end: d };
  }
  if (frequency === "weekly") {
    const d = formatBusinessDate(refUtc);
    return { start: d, end: d };
  }

  // For monthly / quarterly / yearly: use the previous completed period
  // e.g. if today is 2026-03-19 and frequency=monthly, latest completed = 2026-02-28
  const periodEnd = getPeriodEnd(refUtc, frequency);
  const periodEndStr = formatBusinessDate(periodEnd);
  const todayStr = formatBusinessDate(refUtc);

  if (periodEndStr <= todayStr) {
    // current period already ended (or ends today)
    return { start: periodEndStr, end: periodEndStr };
  }
  // current period not yet ended → use previous period
  let prevStart: Date;
  if (frequency === "monthly") {
    prevStart = new Date(Date.UTC(refUtc.getUTCFullYear(), refUtc.getUTCMonth() - 1, 1));
  } else if (frequency === "quarterly") {
    const qStart = Math.floor(refUtc.getUTCMonth() / 3) * 3;
    prevStart = new Date(Date.UTC(refUtc.getUTCFullYear(), qStart - 3, 1));
  } else {
    prevStart = new Date(Date.UTC(refUtc.getUTCFullYear() - 1, 0, 1));
  }
  const prev = formatBusinessDate(getPeriodEnd(prevStart, frequency));
  return { start: prev, end: prev };
}
