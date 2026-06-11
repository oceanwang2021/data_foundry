import type { BusinessDateRange, BusinessDateFrequency } from "@/lib/types";

export const OPEN_ENDED_PREVIEW_PERIODS = 6;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/i;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/i;
const YEAR_PATTERN = /^(\d{4})$/;

export const BUSINESS_DATE_FREQUENCIES: Array<{
  value: BusinessDateFrequency;
  apiValue: Uppercase<BusinessDateFrequency>;
  label: string;
  format: string;
  example: string;
}> = [
  { value: "daily", apiValue: "DAILY", label: "日", format: "yyyy-MM-dd", example: "2026-06-09" },
  { value: "weekly", apiValue: "WEEKLY", label: "周", format: "yyyy-Www", example: "2026-W24" },
  { value: "monthly", apiValue: "MONTHLY", label: "月", format: "yyyy-MM", example: "2026-05" },
  { value: "quarterly", apiValue: "QUARTERLY", label: "季", format: "yyyy-Qn", example: "2026-Q2" },
  { value: "yearly", apiValue: "YEARLY", label: "年", format: "yyyy", example: "2025" },
];

export function normalizeBusinessDateFrequency(value: unknown): BusinessDateFrequency {
  const normalized = String(value ?? "").trim().toLowerCase();
  return BUSINESS_DATE_FREQUENCIES.some((item) => item.value === normalized)
    ? normalized as BusinessDateFrequency
    : "monthly";
}

export function toApiBusinessDateFrequency(
  value: BusinessDateFrequency,
): Uppercase<BusinessDateFrequency> {
  return value.toUpperCase() as Uppercase<BusinessDateFrequency>;
}

export function extractBusinessDateYear(value: string): string | null {
  const matched = String(value).match(/^(\d{4})/);
  return matched ? matched[1] : null;
}

export function extractBusinessDateMonth(value: string): number | null {
  const parsed = businessDatePeriodStart(value);
  return parsed ? parsed.getUTCMonth() + 1 : null;
}

export function pickDefaultBusinessYear(
  availableYears: string[],
  options: { now?: Date } = {},
): string {
  if (availableYears.length === 0) return "";
  const nowYear = String((options.now ?? new Date()).getFullYear());
  if (availableYears.includes(nowYear)) return nowYear;
  return availableYears.filter((year) => year <= nowYear).sort().reverse()[0] ?? availableYears[0];
}

export function limitFutureBusinessDates(
  businessDates: string[],
  options: { now?: Date; maxFuturePeriods?: number; frequency?: BusinessDateFrequency } = {},
): string[] {
  const frequency = options.frequency;
  const maxFuturePeriods = Math.max(options.maxFuturePeriods ?? 1, 0);
  const today = toUtcDate(options.now ?? new Date());
  const historical: string[] = [];
  const future: string[] = [];

  businessDates.forEach((token) => {
    const resolvedFrequency = frequency ?? detectBusinessDateFrequency(token) ?? undefined;
    const start = businessDatePeriodStart(token, resolvedFrequency);
    if (!start) return;
    const currentToken = resolvedFrequency
      ? formatBusinessDateForFrequency(today, resolvedFrequency)
      : formatBusinessDate(today);
    const isHistorical = compareBusinessDates(token, currentToken, resolvedFrequency) < 0;
    (isHistorical ? historical : future).push(token);
  });
  future.sort((left, right) => compareBusinessDates(left, right, frequency));
  const allowed = new Set(future.slice(0, maxFuturePeriods));
  return businessDates.filter((token) => historical.includes(token) || allowed.has(token));
}

export function isOpenEndedBusinessDateRange(range: BusinessDateRange): boolean {
  return range.end === "never";
}

/**
 * Preserve canonical period tokens and valid legacy full dates.
 * Use normalizeBusinessDateForFrequency when the frequency is known.
 */
export function normalizeBusinessDateToken(value: string): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const detected = detectBusinessDateFrequency(trimmed);
  return detected
    ? normalizeBusinessDateForFrequency(trimmed, detected)
    : trimmed;
}

export function normalizeBusinessDateForFrequency(
  value: string,
  frequency: BusinessDateFrequency,
): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  if (isCanonicalBusinessDate(trimmed, frequency)) {
    return canonicalizeToken(trimmed, frequency);
  }

  const parsed = parseLegacyDate(trimmed) ?? businessDatePeriodStart(trimmed);
  return parsed ? formatBusinessDateForFrequency(parsed, frequency) : "";
}

export function isCanonicalBusinessDate(
  value: string,
  frequency: BusinessDateFrequency,
): boolean {
  const trimmed = String(value ?? "").trim();
  if (frequency === "daily") return parseLegacyDate(trimmed) != null;
  if (frequency === "weekly") return parseIsoWeekStart(trimmed) != null;
  if (frequency === "monthly") return parseMonthStart(trimmed) != null;
  if (frequency === "quarterly") return parseQuarterStart(trimmed) != null;
  return YEAR_PATTERN.test(trimmed);
}

export function parseBusinessDate(value: string): Date | null {
  return businessDatePeriodEnd(value);
}

export function businessDatePeriodStart(
  value: string,
  frequency?: BusinessDateFrequency,
): Date | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (frequency === "daily") return parseLegacyDate(trimmed);
  if (frequency === "weekly") return parseIsoWeekStart(trimmed) ?? parseLegacyDate(trimmed);
  if (frequency === "monthly") return parseMonthStart(trimmed) ?? parseLegacyDate(trimmed);
  if (frequency === "quarterly") return parseQuarterStart(trimmed) ?? parseLegacyDate(trimmed);
  if (frequency === "yearly") return parseYearStart(trimmed) ?? parseLegacyDate(trimmed);
  return parseLegacyDate(trimmed)
    ?? parseIsoWeekStart(trimmed)
    ?? parseMonthStart(trimmed)
    ?? parseQuarterStart(trimmed)
    ?? parseYearStart(trimmed);
}

export function businessDatePeriodEnd(
  value: string,
  frequency?: BusinessDateFrequency,
): Date | null {
  const start = businessDatePeriodStart(value, frequency);
  if (!start) return null;
  const resolvedFrequency = frequency ?? detectBusinessDateFrequency(value);
  if (!resolvedFrequency || resolvedFrequency === "daily") return start;
  if (resolvedFrequency === "weekly") return addUtcDays(start, 6);
  if (resolvedFrequency === "monthly") {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  }
  if (resolvedFrequency === "quarterly") {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  }
  return new Date(Date.UTC(start.getUTCFullYear(), 11, 31));
}

export function formatBusinessDate(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function formatBusinessDateForFrequency(
  value: Date,
  frequency: BusinessDateFrequency,
): string {
  const date = toUtcDate(value);
  if (frequency === "daily") return formatBusinessDate(date);
  if (frequency === "weekly") {
    const { weekYear, week } = isoWeekParts(date);
    return `${weekYear}-W${String(week).padStart(2, "0")}`;
  }
  if (frequency === "monthly") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (frequency === "quarterly") {
    return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
  return String(date.getUTCFullYear());
}

export function formatBusinessDateLabel(
  businessDate: string,
  frequency: BusinessDateFrequency,
): string {
  const normalized = normalizeBusinessDateForFrequency(businessDate, frequency);
  if (!normalized) return businessDate;
  if (frequency === "daily") return normalized;
  if (frequency === "weekly") return normalized;
  if (frequency === "monthly") {
    const [year, month] = normalized.split("-");
    return `${year}年${Number(month)}月`;
  }
  if (frequency === "quarterly") {
    const [year, quarter] = normalized.split("-");
    return `${year}年${quarter}`;
  }
  return `${normalized}年`;
}

export function addOffsetDays(dateText: string, offsetDays: number): string {
  const source = businessDatePeriodEnd(dateText);
  if (!source) return dateText;
  return formatBusinessDate(addUtcDays(source, offsetDays));
}

export function buildBusinessDateSlots(
  range: BusinessDateRange,
  options: { referenceDate?: Date; openEndedFuturePeriods?: number } = {},
): string[] {
  const startToken = normalizeBusinessDateForFrequency(range.start, range.frequency);
  const endToken = resolveBusinessDateEndToken(range, options);
  if (!startToken || !endToken || compareBusinessDates(startToken, endToken, range.frequency) > 0) {
    return [];
  }

  const result: string[] = [];
  let cursor = startToken;
  while (compareBusinessDates(cursor, endToken, range.frequency) <= 0 && result.length < 1000) {
    result.push(cursor);
    cursor = nextBusinessDate(cursor, range.frequency);
  }
  return result;
}

export function buildScheduleExamples(
  range: BusinessDateRange,
  offsetDays: number,
  options: { referenceDate?: Date; count?: number } = {},
): Array<{ businessDate: string; scheduleDate: string }> {
  const referenceDate = options.referenceDate ?? new Date();
  const referenceToken = formatBusinessDateForFrequency(referenceDate, range.frequency);
  const count = options.count ?? 3;
  return buildBusinessDateSlots(range, {
    referenceDate,
    openEndedFuturePeriods: Math.max(count + 2, OPEN_ENDED_PREVIEW_PERIODS),
  })
    .filter((token) => compareBusinessDates(token, referenceToken, range.frequency) >= 0)
    .slice(0, count)
    .map((businessDate) => ({
      businessDate,
      scheduleDate: addOffsetDays(businessDate, offsetDays),
    }));
}

export function compareBusinessDates(
  left: string,
  right: string,
  frequency?: BusinessDateFrequency,
): number {
  const leftDate = businessDatePeriodStart(left, frequency);
  const rightDate = businessDatePeriodStart(right, frequency);
  if (!leftDate || !rightDate) return left.localeCompare(right);
  return leftDate.getTime() - rightDate.getTime();
}

export function nextBusinessDate(
  value: string,
  frequency: BusinessDateFrequency,
): string {
  const start = businessDatePeriodStart(value, frequency);
  if (!start) return value;
  const next = new Date(start);
  if (frequency === "daily") next.setUTCDate(next.getUTCDate() + 1);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  if (frequency === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
  if (frequency === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  return formatBusinessDateForFrequency(next, frequency);
}

export function snapToPeriodEnd(
  dateText: string,
  frequency: BusinessDateFrequency,
): string {
  return normalizeBusinessDateForFrequency(dateText, frequency) || dateText;
}

export function buildSelectableBusinessDates(
  frequency: BusinessDateFrequency,
  options: { referenceDate?: Date; lookbackYears?: number } = {},
): string[] {
  const referenceDate = toUtcDate(options.referenceDate ?? new Date());
  const start = new Date(Date.UTC(
    referenceDate.getUTCFullYear() - (options.lookbackYears ?? 5),
    0,
    1,
  ));
  return buildBusinessDateSlots({
    start: formatBusinessDateForFrequency(start, frequency),
    end: formatBusinessDateForFrequency(referenceDate, frequency),
    frequency,
  });
}

export function buildDefaultDateRange(
  frequency: BusinessDateFrequency,
  referenceDate?: Date,
): { start: string; end: string } {
  const reference = toUtcDate(referenceDate ?? new Date());
  const current = formatBusinessDateForFrequency(reference, frequency);
  if (frequency === "daily" || frequency === "weekly") {
    return { start: current, end: current };
  }
  const currentEnd = businessDatePeriodEnd(current, frequency);
  if (currentEnd && currentEnd.getTime() <= reference.getTime()) {
    return { start: current, end: current };
  }
  const start = businessDatePeriodStart(current, frequency);
  if (!start) return { start: current, end: current };
  const previousDate = new Date(start);
  if (frequency === "monthly") previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  if (frequency === "quarterly") previousDate.setUTCMonth(previousDate.getUTCMonth() - 3);
  if (frequency === "yearly") previousDate.setUTCFullYear(previousDate.getUTCFullYear() - 1);
  const previous = formatBusinessDateForFrequency(previousDate, frequency);
  return { start: previous, end: previous };
}

export const buildDemoDefaultDateRange = buildDefaultDateRange;

function resolveBusinessDateEndToken(
  range: BusinessDateRange,
  options: { referenceDate?: Date; openEndedFuturePeriods?: number },
): string {
  if (!isOpenEndedBusinessDateRange(range)) {
    return normalizeBusinessDateForFrequency(range.end, range.frequency);
  }
  const current = formatBusinessDateForFrequency(options.referenceDate ?? new Date(), range.frequency);
  const start = normalizeBusinessDateForFrequency(range.start, range.frequency);
  let cursor = start && compareBusinessDates(start, current, range.frequency) > 0 ? start : current;
  const periods = Math.max(options.openEndedFuturePeriods ?? OPEN_ENDED_PREVIEW_PERIODS, 0);
  for (let index = 0; index < periods; index += 1) {
    cursor = nextBusinessDate(cursor, range.frequency);
  }
  return cursor;
}

function canonicalizeToken(value: string, frequency: BusinessDateFrequency): string {
  if (frequency === "weekly") return value.toUpperCase();
  if (frequency === "quarterly") return value.toUpperCase();
  return value;
}

function detectBusinessDateFrequency(value: string): BusinessDateFrequency | null {
  if (DAY_PATTERN.test(value)) return "daily";
  if (WEEK_PATTERN.test(value)) return "weekly";
  if (MONTH_PATTERN.test(value)) return "monthly";
  if (QUARTER_PATTERN.test(value)) return "quarterly";
  if (YEAR_PATTERN.test(value)) return "yearly";
  return null;
}

function parseLegacyDate(value: string): Date | null {
  const matched = value.match(DAY_PATTERN);
  if (!matched) return null;
  return createValidatedUtcDate(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
}

function parseMonthStart(value: string): Date | null {
  const matched = value.match(MONTH_PATTERN);
  if (!matched) return null;
  return createValidatedUtcDate(Number(matched[1]), Number(matched[2]) - 1, 1);
}

function parseQuarterStart(value: string): Date | null {
  const matched = value.match(QUARTER_PATTERN);
  if (!matched) return null;
  return createValidatedUtcDate(Number(matched[1]), (Number(matched[2]) - 1) * 3, 1);
}

function parseYearStart(value: string): Date | null {
  const matched = value.match(YEAR_PATTERN);
  return matched ? createValidatedUtcDate(Number(matched[1]), 0, 1) : null;
}

function parseIsoWeekStart(value: string): Date | null {
  const matched = value.match(WEEK_PATTERN);
  if (!matched) return null;
  const weekYear = Number(matched[1]);
  const week = Number(matched[2]);
  if (week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4));
  const monday = addUtcDays(januaryFourth, 1 - isoDayOfWeek(januaryFourth));
  const result = addUtcDays(monday, (week - 1) * 7);
  const normalized = formatBusinessDateForFrequency(result, "weekly");
  return normalized === `${weekYear}-W${String(week).padStart(2, "0")}` ? result : null;
}

function isoWeekParts(date: Date): { weekYear: number; week: number } {
  const target = toUtcDate(date);
  target.setUTCDate(target.getUTCDate() + 4 - isoDayOfWeek(target));
  const weekYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { weekYear, week };
}

function isoDayOfWeek(date: Date): number {
  return date.getUTCDay() || 7;
}

function createValidatedUtcDate(year: number, monthIndex: number, day: number): Date | null {
  const parsed = new Date(Date.UTC(year, monthIndex, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === monthIndex
    && parsed.getUTCDate() === day
    ? parsed
    : null;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toUtcDate(source: Date): Date {
  return new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
}
