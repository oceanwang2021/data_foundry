package com.huatai.datafoundry.agent.agent.application.service;

import com.huatai.datafoundry.contract.agent.AgentExecutionRequest;
import com.huatai.datafoundry.contract.agent.NarrowIndicatorRow;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class AgentResultNormalizer {
  private static final Pattern MARKDOWN_LINK = Pattern.compile("\\[([^\\]]*)\\]\\(([^\\)]*)\\)");
  private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");

  public List<NarrowIndicatorRow> normalize(
      AgentExecutionRequest request,
      Map<String, Object> rawResult,
      List<String> warnings) {
    List<NarrowIndicatorRow> rows = new ArrayList<NarrowIndicatorRow>();
    if (rawResult == null || rawResult.isEmpty()) {
      addWarning(warnings, "agent result is empty");
      return rows;
    }

    Map<String, Object> payload = unwrapData(rawResult);
    List<Map<String, Object>> structuredRows = readStructuredRows(payload);
    if (!structuredRows.isEmpty()) {
      for (Map<String, Object> rawRow : structuredRows) {
        rows.addAll(normalizeStructuredRow(request, rawRow, warnings));
      }
      return rows;
    }

    String finalReport = asString(firstNonNull(payload.get("final_report"), payload.get("finalReport")));
    if (finalReport == null || finalReport.trim().isEmpty()) {
      addWarning(warnings, "agent result has neither structured rows nor final_report");
      return rows;
    }

    List<Map<String, Object>> markdownRows = parseFirstMarkdownTable(finalReport, warnings);
    if (markdownRows.isEmpty()) {
      addWarning(warnings, "final_report has no parsable markdown table");
      return rows;
    }
    for (Map<String, Object> rawRow : markdownRows) {
      rows.addAll(normalizeStructuredRow(request, rawRow, warnings));
    }
    return rows;
  }

  public Map<String, Object> buildRawResult(
      AgentExecutionRequest request,
      List<NarrowIndicatorRow> rows,
      String status,
      String finalReport,
      String errorMessage,
      Integer durationMs) {
    Map<String, Object> raw = new LinkedHashMap<String, Object>();
    raw.put("task_id", request != null ? request.getTaskId() : null);
    raw.put("success", !"failed".equalsIgnoreCase(status));
    raw.put("status", status);
    raw.put("final_report", finalReport);
    raw.put("rows", rows);
    raw.put("error", errorMessage);
    raw.put("duration_ms", durationMs);
    return raw;
  }

  private List<NarrowIndicatorRow> normalizeStructuredRow(
      AgentExecutionRequest request,
      Map<String, Object> rawRow,
      List<String> warnings) {
    List<NarrowIndicatorRow> out = new ArrayList<NarrowIndicatorRow>();
    if (rawRow == null || rawRow.isEmpty()) {
      return out;
    }

    String explicitIndicatorKey = firstText(rawRow, "indicatorColumn", "indicator_column", "indicatorKey", "indicator_key", "metric_id");
    if (explicitIndicatorKey != null && !explicitIndicatorKey.trim().isEmpty()) {
      out.add(buildNarrowRow(request, rawRow, explicitIndicatorKey.trim(), null));
      return out;
    }

    List<String> expectedKeys = request != null && request.getIndicatorKeys() != null
        ? request.getIndicatorKeys()
        : new ArrayList<String>();
    Set<String> matched = new LinkedHashSet<String>();
    for (String key : expectedKeys) {
      String header = findMatchingHeader(rawRow, key);
      if (header == null) {
        continue;
      }
      matched.add(key);
      out.add(buildNarrowRow(request, rawRow, key, header));
    }

    if (out.isEmpty()) {
      addWarning(warnings, "structured row has no indicator column: " + rawRow.keySet());
    }
    return out;
  }

  private NarrowIndicatorRow buildNarrowRow(
      AgentExecutionRequest request,
      Map<String, Object> rawRow,
      String indicatorKey,
      String valueHeader) {
    NarrowIndicatorRow row = new NarrowIndicatorRow();
    String normalizedKey = normalizeIndicatorKey(indicatorKey);
    Object valueObj = valueHeader != null
        ? rawRow.get(valueHeader)
        : firstNonNull(rawRow.get("indicatorValue"), rawRow.get("indicator_value"), rawRow.get("value"));
    Object rawValueObj = firstNonNull(rawRow.get("rawIndicatorValue"), rawRow.get("raw_indicator_value"), rawRow.get("rawValue"), rawRow.get("raw_value"));

    row.setBusinessDate(firstText(rawRow, "businessDate", "business_date", "BIZ_DATE"));
    if ((row.getBusinessDate() == null || row.getBusinessDate().trim().isEmpty()) && request != null) {
      row.setBusinessDate(request.getBusinessDate());
    }
    row.setIndicatorKey(normalizedKey);
    row.setIndicatorColumn(normalizedKey);
    row.setIndicatorName(firstText(rawRow, "indicatorName", "indicator_name", "metric_name", valueHeader));
    if ((row.getIndicatorName() == null || row.getIndicatorName().trim().isEmpty()) && request != null && request.getIndicatorNames() != null) {
      row.setIndicatorName(request.getIndicatorNames().get(normalizedKey));
    }
    row.setIndicatorDescription(firstText(rawRow, "indicatorDescription", "indicator_description", "description"));
    row.setValue(cleanCell(valueObj));
    row.setRawValue(cleanCell(rawValueObj != null ? rawValueObj : valueObj));
    row.setUnit(firstText(rawRow, "unit", "indicatorUnit", "indicator_unit"));
    if ((row.getUnit() == null || row.getUnit().trim().isEmpty()) && request != null && request.getIndicatorUnits() != null) {
      row.setUnit(request.getIndicatorUnits().get(normalizedKey));
    }
    row.setPublishedAt(firstText(rawRow, "publishedAt", "published_at", "publish_date", "data_publish_time"));
    row.setSourceSite(firstText(rawRow, "sourceSite", "source_site", "dataSource", "data_source"));
    row.setSourceUrl(firstText(rawRow, "sourceUrl", "source_url", "sourceLink", "source_link", "Source_URL"));
    if (row.getSourceUrl() == null || row.getSourceUrl().trim().isEmpty()) {
      row.setSourceUrl(extractMarkdownUrls(cleanCell(firstNonNull(rawRow.get("Source_URL"), rawRow.get("source")))));
    }
    row.setQuoteText(firstText(rawRow, "quoteText", "quote_text", "Source_Evidence", "source_evidence"));
    row.setIndicatorLogic(firstText(rawRow, "indicatorLogic", "indicator_logic"));
    row.setIndicatorLogicSupplement(firstText(rawRow, "indicatorLogicSupplement", "indicator_logic_supplement"));
    row.setMaxValue(firstText(rawRow, "maxValue", "max_value", "Max_Value"));
    row.setMinValue(firstText(rawRow, "minValue", "min_value", "Min_Value"));
    row.setConfidence(asDouble(firstNonNull(rawRow.get("confidence"), rawRow.get("Confidence"))));
    row.setReasoning(firstText(rawRow, "reasoning", "Reasoning"));
    row.setWhyNotFound(firstText(rawRow, "whyNotFound", "why_not_found"));
    row.setDimensionValues(resolveDimensionValues(request, rawRow));
    return row;
  }

  private Map<String, String> resolveDimensionValues(AgentExecutionRequest request, Map<String, Object> rawRow) {
    Map<String, String> values = new LinkedHashMap<String, String>();
    if (request != null && request.getDimensionValues() != null) {
      values.putAll(request.getDimensionValues());
    }
    Object dimensionValuesObj = firstNonNull(rawRow.get("dimensionValues"), rawRow.get("dimension_values"));
    if (dimensionValuesObj instanceof Map) {
      Map<?, ?> dim = (Map<?, ?>) dimensionValuesObj;
      for (Map.Entry<?, ?> entry : dim.entrySet()) {
        if (entry.getKey() != null) {
          values.put(String.valueOf(entry.getKey()), cleanCell(entry.getValue()));
        }
      }
    }
    copyIfPresent(rawRow, values, "BIZ_DATE");
    copyIfPresent(rawRow, values, "business_date");
    copyIfPresent(rawRow, values, "comcode");
    copyIfPresent(rawRow, values, "company_name");
    copyIfPresent(rawRow, values, "企业名称");
    return values;
  }

  private void copyIfPresent(Map<String, Object> rawRow, Map<String, String> values, String key) {
    if (rawRow.containsKey(key)) {
      values.put(key, cleanCell(rawRow.get(key)));
    }
  }

  private List<Map<String, Object>> readStructuredRows(Map<String, Object> payload) {
    Object rowsObj = firstNonNull(payload.get("rows"), payload.get("table_data"), payload.get("tableData"));
    List<Map<String, Object>> rows = toMapList(rowsObj);
    if (!rows.isEmpty()) {
      return rows;
    }
    Object resultObj = payload.get("result");
    if (resultObj instanceof Map) {
      Map<?, ?> result = (Map<?, ?>) resultObj;
      return toMapList(firstNonNull(result.get("rows"), result.get("table_data"), result.get("tableData")));
    }
    return rows;
  }

  private List<Map<String, Object>> parseFirstMarkdownTable(String markdown, List<String> warnings) {
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    if (markdown == null) {
      return out;
    }
    String[] lines = markdown.replace("\r\n", "\n").replace('\r', '\n').split("\n");
    for (int i = 0; i + 1 < lines.length; i++) {
      String headerLine = lines[i].trim();
      String separatorLine = lines[i + 1].trim();
      if (!looksLikeTableLine(headerLine) || !looksLikeSeparator(separatorLine)) {
        continue;
      }
      List<String> headers = splitMarkdownRow(headerLine);
      int rowIndex = i + 2;
      while (rowIndex < lines.length && looksLikeTableLine(lines[rowIndex])) {
        List<String> cells = splitMarkdownRow(lines[rowIndex].trim());
        if (cells.size() > 0) {
          Map<String, Object> row = new LinkedHashMap<String, Object>();
          for (int c = 0; c < headers.size(); c++) {
            row.put(headers.get(c), c < cells.size() ? cells.get(c) : "");
          }
          out.add(row);
        }
        rowIndex++;
      }
      return out;
    }
    addWarning(warnings, "no markdown table detected in final_report");
    return out;
  }

  private boolean looksLikeTableLine(String line) {
    return line != null && line.startsWith("|") && line.endsWith("|") && line.indexOf('|', 1) > 0;
  }

  private boolean looksLikeSeparator(String line) {
    if (!looksLikeTableLine(line)) {
      return false;
    }
    String stripped = line.replace("|", "").replace(":", "").replace("-", "").replace(" ", "");
    return stripped.length() == 0;
  }

  private List<String> splitMarkdownRow(String line) {
    List<String> cells = new ArrayList<String>();
    String inner = line;
    if (inner.startsWith("|")) {
      inner = inner.substring(1);
    }
    if (inner.endsWith("|")) {
      inner = inner.substring(0, inner.length() - 1);
    }
    String[] parts = inner.split("\\|", -1);
    for (String part : parts) {
      cells.add(cleanCell(part));
    }
    return cells;
  }

  private Map<String, Object> unwrapData(Map<String, Object> raw) {
    Object data = raw.get("data");
    if (data instanceof Map) {
      Map<String, Object> out = new LinkedHashMap<String, Object>();
      out.putAll(castMap(data));
      if (!out.containsKey("task_id")) out.put("task_id", raw.get("task_id"));
      return out;
    }
    return raw;
  }

  private List<Map<String, Object>> toMapList(Object value) {
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    if (!(value instanceof List)) {
      return out;
    }
    for (Object item : (List<?>) value) {
      if (item instanceof Map) {
        out.add(castMap(item));
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> castMap(Object value) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    if (!(value instanceof Map)) {
      return out;
    }
    Map<?, ?> raw = (Map<?, ?>) value;
    for (Map.Entry<?, ?> entry : raw.entrySet()) {
      if (entry.getKey() != null) {
        out.put(String.valueOf(entry.getKey()), entry.getValue());
      }
    }
    return out;
  }

  private String findMatchingHeader(Map<String, Object> rawRow, String indicatorKey) {
    if (indicatorKey == null || indicatorKey.trim().isEmpty()) {
      return null;
    }
    if (rawRow.containsKey(indicatorKey)) {
      return indicatorKey;
    }
    String normalizedKey = normalizeToken(indicatorKey);
    for (String header : rawRow.keySet()) {
      String normalizedHeader = normalizeToken(header);
      if (normalizedHeader.equals(normalizedKey) || normalizedHeader.startsWith(normalizedKey)) {
        return header;
      }
    }
    return null;
  }

  private String normalizeIndicatorKey(String key) {
    if (key == null) {
      return null;
    }
    String trimmed = key.trim();
    int space = trimmed.indexOf(' ');
    int paren = trimmed.indexOf('(');
    int fullParen = trimmed.indexOf('（');
    int cut = -1;
    if (space >= 0) cut = space;
    if (paren >= 0 && (cut < 0 || paren < cut)) cut = paren;
    if (fullParen >= 0 && (cut < 0 || fullParen < cut)) cut = fullParen;
    return cut > 0 ? trimmed.substring(0, cut) : trimmed;
  }

  private String normalizeToken(String value) {
    if (value == null) {
      return "";
    }
    return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_]", "");
  }

  private String firstText(Map<String, Object> rawRow, String... keys) {
    if (rawRow == null || keys == null) {
      return null;
    }
    for (String key : keys) {
      if (key == null) continue;
      if (rawRow.containsKey(key)) {
        String value = cleanCell(rawRow.get(key));
        if (value != null && !value.trim().isEmpty() && !"null".equalsIgnoreCase(value.trim())) {
          return value;
        }
      }
    }
    return null;
  }

  private Object firstNonNull(Object... values) {
    if (values == null) {
      return null;
    }
    for (Object value : values) {
      if (value != null) {
        return value;
      }
    }
    return null;
  }

  private String cleanCell(Object value) {
    if (value == null) {
      return null;
    }
    String s = String.valueOf(value).trim();
    if (s.isEmpty() || "null".equalsIgnoreCase(s)) {
      return null;
    }
    s = s.replace("<br/>", "\n").replace("<br />", "\n").replace("<br>", "\n");
    s = HTML_TAG.matcher(s).replaceAll("");
    s = s.replace("\\n", "\n").replace("&nbsp;", " ").trim();
    return s;
  }

  private String asString(Object value) {
    String s = cleanCell(value);
    return s != null ? s : "";
  }

  private Double asDouble(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Number) {
      return Double.valueOf(((Number) value).doubleValue());
    }
    try {
      return Double.valueOf(String.valueOf(value).trim());
    } catch (Exception ignored) {
      return null;
    }
  }

  private String extractMarkdownUrls(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    List<String> urls = new ArrayList<String>();
    Matcher matcher = MARKDOWN_LINK.matcher(value);
    while (matcher.find()) {
      if (matcher.group(2) != null && !matcher.group(2).trim().isEmpty()) {
        urls.add(matcher.group(2).trim());
      }
    }
    return urls.isEmpty() ? value : join(urls, "\n");
  }

  private String join(List<String> values, String separator) {
    StringBuilder sb = new StringBuilder();
    for (String value : values) {
      if (sb.length() > 0) {
        sb.append(separator);
      }
      sb.append(value);
    }
    return sb.toString();
  }

  private void addWarning(List<String> warnings, String warning) {
    if (warnings != null && warning != null && warning.trim().length() > 0) {
      warnings.add(warning);
    }
  }
}
