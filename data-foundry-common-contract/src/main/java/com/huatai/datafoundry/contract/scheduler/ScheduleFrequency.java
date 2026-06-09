package com.huatai.datafoundry.contract.scheduler;

import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoField;
import java.time.temporal.WeekFields;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public enum ScheduleFrequency {
  DAILY,
  WEEKLY,
  MONTHLY,
  QUARTERLY,
  YEARLY;

  private static final Pattern WEEK_PATTERN = Pattern.compile("^(\\d{4})-W(\\d{2})$");
  private static final Pattern QUARTER_PATTERN = Pattern.compile("^(\\d{4})-Q([1-4])$");
  private static final Pattern YEAR_PATTERN = Pattern.compile("^(\\d{4})$");
  private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;
  private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");
  private static final WeekFields ISO_WEEK = WeekFields.ISO;

  public static ScheduleFrequency parse(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      throw new IllegalArgumentException("Schedule frequency is required");
    }
    try {
      return valueOf(raw.trim().toUpperCase(Locale.ROOT));
    } catch (IllegalArgumentException ex) {
      throw new IllegalArgumentException("Unsupported schedule frequency: " + raw.trim());
    }
  }

  public String normalizeBusinessDate(String raw) {
    String value = requireValue(raw);
    try {
      switch (this) {
        case DAILY:
          return LocalDate.parse(value, DAY_FORMAT).format(DAY_FORMAT);
        case WEEKLY:
          return normalizeIsoWeek(value);
        case MONTHLY:
          return YearMonth.parse(value, MONTH_FORMAT).format(MONTH_FORMAT);
        case QUARTERLY:
          return normalizeQuarter(value);
        case YEARLY:
          return Year.parse(value).toString();
        default:
          throw new IllegalArgumentException("Unsupported schedule frequency: " + name());
      }
    } catch (RuntimeException ex) {
      throw invalidBusinessDate(value);
    }
  }

  public String normalizeCompatibleBusinessDate(String raw) {
    String value = requireValue(raw);
    try {
      return normalizeBusinessDate(value);
    } catch (IllegalArgumentException ignored) {
      LocalDate date = tryParseDate(value);
      if (date != null) {
        return format(date);
      }
      if (this == QUARTERLY) {
        YearMonth month = tryParseMonth(value);
        if (month != null) {
          return formatQuarter(month.getYear(), ((month.getMonthValue() - 1) / 3) + 1);
        }
      }
      if (this == YEARLY) {
        YearMonth month = tryParseMonth(value);
        if (month != null) {
          return Integer.toString(month.getYear());
        }
      }
      throw invalidBusinessDate(value);
    }
  }

  public String currentPeriod(LocalDate date) {
    return format(requireDate(date));
  }

  public String previousPeriod(LocalDate date) {
    LocalDate current = requireDate(date);
    switch (this) {
      case DAILY:
        return format(current.minusDays(1));
      case WEEKLY:
        return format(current.minusWeeks(1));
      case MONTHLY:
        return format(current.minusMonths(1));
      case QUARTERLY:
        return format(current.minusMonths(3));
      case YEARLY:
        return format(current.minusYears(1));
      default:
        throw new IllegalArgumentException("Unsupported schedule frequency: " + name());
    }
  }

  public String nextPeriod(String businessDate) {
    LocalDate start = periodStart(businessDate);
    switch (this) {
      case DAILY:
        return format(start.plusDays(1));
      case WEEKLY:
        return format(start.plusWeeks(1));
      case MONTHLY:
        return format(start.plusMonths(1));
      case QUARTERLY:
        return format(start.plusMonths(3));
      case YEARLY:
        return format(start.plusYears(1));
      default:
        throw new IllegalArgumentException("Unsupported schedule frequency: " + name());
    }
  }

  public LocalDate periodStart(String businessDate) {
    String normalized = normalizeBusinessDate(businessDate);
    switch (this) {
      case DAILY:
        return LocalDate.parse(normalized, DAY_FORMAT);
      case WEEKLY:
        return parseIsoWeekStart(normalized);
      case MONTHLY:
        return YearMonth.parse(normalized, MONTH_FORMAT).atDay(1);
      case QUARTERLY:
        Matcher quarter = QUARTER_PATTERN.matcher(normalized);
        quarter.matches();
        return LocalDate.of(
            Integer.parseInt(quarter.group(1)),
            ((Integer.parseInt(quarter.group(2)) - 1) * 3) + 1,
            1);
      case YEARLY:
        return Year.parse(normalized).atDay(1);
      default:
        throw new IllegalArgumentException("Unsupported schedule frequency: " + name());
    }
  }

  public int defaultMaxPeriods() {
    switch (this) {
      case DAILY:
        return 366;
      case WEEKLY:
        return 260;
      case MONTHLY:
        return 120;
      case QUARTERLY:
        return 80;
      case YEARLY:
        return 30;
      default:
        return 120;
    }
  }

  private String format(LocalDate date) {
    switch (this) {
      case DAILY:
        return date.format(DAY_FORMAT);
      case WEEKLY:
        int weekYear = date.get(ISO_WEEK.weekBasedYear());
        int week = date.get(ISO_WEEK.weekOfWeekBasedYear());
        return formatWeek(weekYear, week);
      case MONTHLY:
        return YearMonth.from(date).format(MONTH_FORMAT);
      case QUARTERLY:
        return formatQuarter(date.getYear(), ((date.getMonthValue() - 1) / 3) + 1);
      case YEARLY:
        return String.format(Locale.ROOT, "%04d", date.getYear());
      default:
        throw new IllegalArgumentException("Unsupported schedule frequency: " + name());
    }
  }

  private String normalizeIsoWeek(String value) {
    Matcher matcher = WEEK_PATTERN.matcher(value);
    if (!matcher.matches()) {
      throw invalidBusinessDate(value);
    }
    int weekYear = Integer.parseInt(matcher.group(1));
    int week = Integer.parseInt(matcher.group(2));
    LocalDate monday = isoWeekStart(weekYear, week);
    String normalized = formatWeek(
        monday.get(ISO_WEEK.weekBasedYear()),
        monday.get(ISO_WEEK.weekOfWeekBasedYear()));
    if (!normalized.equals(value)) {
      throw invalidBusinessDate(value);
    }
    return normalized;
  }

  private static LocalDate parseIsoWeekStart(String value) {
    Matcher matcher = WEEK_PATTERN.matcher(value);
    if (!matcher.matches()) {
      throw new IllegalArgumentException("Invalid ISO week: " + value);
    }
    return isoWeekStart(
        Integer.parseInt(matcher.group(1)),
        Integer.parseInt(matcher.group(2)));
  }

  private static LocalDate isoWeekStart(int weekYear, int week) {
    return LocalDate.of(weekYear, 1, 4)
        .with(ISO_WEEK.weekBasedYear(), weekYear)
        .with(ISO_WEEK.weekOfWeekBasedYear(), week)
        .with(ChronoField.DAY_OF_WEEK, 1);
  }

  private String normalizeQuarter(String value) {
    Matcher matcher = QUARTER_PATTERN.matcher(value);
    if (!matcher.matches()) {
      throw invalidBusinessDate(value);
    }
    return formatQuarter(
        Integer.parseInt(matcher.group(1)),
        Integer.parseInt(matcher.group(2)));
  }

  private IllegalArgumentException invalidBusinessDate(String value) {
    return new IllegalArgumentException(
        "Invalid businessDate for " + name() + ": " + value);
  }

  private static String formatWeek(int weekYear, int week) {
    return String.format(Locale.ROOT, "%04d-W%02d", weekYear, week);
  }

  private static String formatQuarter(int year, int quarter) {
    return String.format(Locale.ROOT, "%04d-Q%d", year, quarter);
  }

  private static LocalDate tryParseDate(String value) {
    try {
      return LocalDate.parse(value, DAY_FORMAT);
    } catch (Exception ignored) {
      return null;
    }
  }

  private static YearMonth tryParseMonth(String value) {
    try {
      return YearMonth.parse(value, MONTH_FORMAT);
    } catch (Exception ignored) {
      return null;
    }
  }

  private static String requireValue(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      throw new IllegalArgumentException("businessDate is required");
    }
    return raw.trim();
  }

  private static LocalDate requireDate(LocalDate date) {
    if (date == null) {
      throw new IllegalArgumentException("date is required");
    }
    return date;
  }
}
