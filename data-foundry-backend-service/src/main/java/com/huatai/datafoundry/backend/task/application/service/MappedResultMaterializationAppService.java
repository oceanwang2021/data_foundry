package com.huatai.datafoundry.backend.task.application.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import com.huatai.datafoundry.backend.task.domain.model.MetricFieldMapping;
import com.huatai.datafoundry.backend.task.domain.model.WideTableRowValuePatch;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableRowWriteRepository;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.MetricFieldMappingMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MappedResultMaterializationAppService {
  private static final TypeReference<List<Map<String, Object>>> ROW_LIST_REF =
      new TypeReference<List<Map<String, Object>>>() {};
  private static final TypeReference<Map<String, Object>> MAP_REF =
      new TypeReference<Map<String, Object>>() {};
  private static final String COL_METRIC_NAME = "\u6307\u6807\u540d\u79f0 (Metric Name)";
  private static final String COL_VALUE = "\u6307\u6807\u503c (Value)";
  private static final String COL_UNIT = "\u5355\u4f4d (Unit)";
  private static final String COL_DATA_PERIOD = "\u6570\u636e\u65f6\u95f4 (Data Period)";
  private static final String COL_DATA_SOURCE = "\u6570\u636e\u6765\u6e90 (Data Source)";
  private static final String COL_NOTES = "\u903b\u8f91\u8bf4\u660e\u53ca\u8865\u5145 (Notes)";
  private static final String COL_MIN_VALUE = "Min_Value";
  private static final String COL_MAX_VALUE = "Max_Value";
  private static final String COL_SOURCE_URL = "Source_URL";
  private static final String COL_SOURCE_EVIDENCE = "Source_Evidence";
  private static final String COL_ROW_ID = "row_id";
  private static final String COL_FETCH_TASK_ID = "fetch_task_id";
  private static final String COL_COLLECTION_RESULT_ID = "collection_result_id";
  private static final String COL_BUSINESS_DATE = "business_date";

  private final CollectionResultRepository collectionResultRepository;
  private final MetricFieldMappingMapper metricFieldMappingMapper;
  private final WideTableRowWriteRepository wideTableRowWriteRepository;
  private final ObjectMapper objectMapper;

  public MappedResultMaterializationAppService(
      CollectionResultRepository collectionResultRepository,
      MetricFieldMappingMapper metricFieldMappingMapper,
      WideTableRowWriteRepository wideTableRowWriteRepository,
      ObjectMapper objectMapper) {
    this.collectionResultRepository = collectionResultRepository;
    this.metricFieldMappingMapper = metricFieldMappingMapper;
    this.wideTableRowWriteRepository = wideTableRowWriteRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public MaterializationOutcome materializeWideTable(String wideTableId) {
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Wide table id is required");
    }
    String normalizedWideTableId = wideTableId.trim();
    Map<String, MetricFieldMapping> confirmedMappings = confirmedMappingsBySourceMetric(normalizedWideTableId);
    if (confirmedMappings.isEmpty()) {
      return new MaterializationOutcome(normalizedWideTableId, 0, 0, 0, 0, 0);
    }

    List<CollectionResult> results = collectionResultRepository.listResultsByWideTable(normalizedWideTableId);
    int resultCount = 0;
    int detailRowCount = 0;
    int cellCount = 0;
    int skippedMissingRowCount = 0;
    int skippedUnmappedMetricCount = 0;

    for (CollectionResult result : results) {
      if (result == null) {
        continue;
      }
      resultCount++;
      collectionResultRepository.deleteRowsByResultId(result.getId());

      List<Map<String, Object>> normalizedRows = parseNormalizedRows(result.getNormalizedRowsJson());
      List<CollectionResultRow> detailRows = new ArrayList<CollectionResultRow>();
      Map<Integer, Map<String, Object>> cellsByRowId = new LinkedHashMap<Integer, Map<String, Object>>();
      int acceptedMissingRowCount = 0;
      LocalDateTime collectedAt = result.getCollectedAt() != null ? result.getCollectedAt() : LocalDateTime.now();

      int index = 0;
      for (Map<String, Object> normalizedRow : normalizedRows) {
        String sourceMetricName = trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.METRIC_NAME));
        if (sourceMetricName == null) {
          skippedUnmappedMetricCount++;
          continue;
        }
        MetricFieldMapping mapping = confirmedMappings.get(sourceMetricName);
        if (mapping == null || trimToNull(mapping.getTargetIndicatorKey()) == null) {
          skippedUnmappedMetricCount++;
          continue;
        }

        CollectionResultRow detailRow =
            buildDetailRow(result, normalizedRow, mapping, index++, collectedAt);
        detailRows.add(detailRow);
        detailRowCount++;
        if ("accepted".equals(detailRow.getStatus())) {
          Integer targetRowId = detailRow.getRowId();
          if (targetRowId == null) {
            acceptedMissingRowCount++;
          } else {
            Map<String, Object> cellsToWrite = cellsByRowId.get(targetRowId);
            if (cellsToWrite == null) {
              cellsToWrite = new LinkedHashMap<String, Object>();
              cellsByRowId.put(targetRowId, cellsToWrite);
            }
            cellsToWrite.put(mapping.getTargetIndicatorKey(), buildCell(detailRow, collectedAt));
          }
        }
      }
      collectionResultRepository.insertRows(detailRows);
      skippedMissingRowCount += acceptedMissingRowCount;
      if (cellsByRowId.isEmpty()) {
        continue;
      }
      for (Map.Entry<Integer, Map<String, Object>> entry : cellsByRowId.entrySet()) {
        int updated = mergeWideTableCells(normalizedWideTableId, entry.getKey(), entry.getValue());
        if (updated > 0) {
          cellCount += entry.getValue().size();
        } else {
          skippedMissingRowCount += entry.getValue().size();
        }
      }
    }
    return new MaterializationOutcome(
        normalizedWideTableId,
        resultCount,
        detailRowCount,
        cellCount,
        skippedMissingRowCount,
        skippedUnmappedMetricCount);
  }

  private Map<String, MetricFieldMapping> confirmedMappingsBySourceMetric(String wideTableId) {
    List<MetricFieldMapping> mappings = metricFieldMappingMapper.listByWideTable(wideTableId);
    Map<String, MetricFieldMapping> out = new HashMap<String, MetricFieldMapping>();
    if (mappings == null) {
      return out;
    }
    for (MetricFieldMapping mapping : mappings) {
      if (mapping == null
          || !"confirmed".equalsIgnoreCase(mapping.getStatus())
          || trimToNull(mapping.getSourceMetricName()) == null
          || trimToNull(mapping.getTargetIndicatorKey()) == null) {
        continue;
      }
      out.put(mapping.getSourceMetricName(), mapping);
    }
    return out;
  }

  private CollectionResultRow buildDetailRow(
      CollectionResult result,
      Map<String, Object> normalizedRow,
      MetricFieldMapping mapping,
      int index,
      LocalDateTime collectedAt) {
    String value = trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.VALUE));
    String cleanedValue = cleanEmptyValue(value);
    CollectionResultRow row = new CollectionResultRow();
    row.setId(buildStableId("crr_map", result.getId(), mapping.getTargetIndicatorKey(), String.valueOf(index)));
    row.setCollectionResultId(result.getId());
    row.setFetchTaskId(firstNonBlank(valueFromTechnicalColumn(normalizedRow, COL_FETCH_TASK_ID), result.getFetchTaskId()));
    row.setScheduleJobId(result.getScheduleJobId());
    row.setWideTableId(result.getWideTableId());
    row.setRowId(rowIdFromTechnicalColumn(normalizedRow, result.getRowId()));
    row.setSourceMetricName(mapping.getSourceMetricName());
    row.setTargetIndicatorKey(mapping.getTargetIndicatorKey());
    row.setIndicatorKey(mapping.getTargetIndicatorKey());
    row.setIndicatorName(firstNonBlank(mapping.getTargetIndicatorName(), mapping.getTargetIndicatorKey()));
    row.setBusinessDate(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.PUBLISHED_AT)));
    row.setDimensionValuesJson(writeJson(extractDimensionValues(normalizedRow)));
    row.setRawValue(value);
    row.setCleanedValue(cleanedValue);
    row.setUnit(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.UNIT)));
    row.setPublishedAt(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.PUBLISHED_AT)));
    row.setSourceSite(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.DATA_SOURCE)));
    row.setSourceUrl(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.SOURCE_URL)));
    row.setQuoteText(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.QUOTE_TEXT)));
    row.setMaxValue(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.MAX_VALUE)));
    row.setMinValue(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.MIN_VALUE)));
    row.setConfidence(new BigDecimal("0.8600"));
    row.setStatus(cleanedValue == null ? "not_found" : "accepted");
    row.setWarningMsg(row.getRowId() == null ? "collection result row_id is missing" : null);
    row.setReasoning(trimToNull(valueByKnownColumn(normalizedRow, ColumnKind.NOTES)));
    row.setWhyNotFound(cleanedValue == null ? "value is empty" : null);
    return row;
  }

  private Map<String, Object> buildCell(CollectionResultRow row, LocalDateTime collectedAt) {
    Map<String, Object> cell = new LinkedHashMap<String, Object>();
    cell.put("value", row.getCleanedValue());
    cell.put("raw_value", row.getRawValue());
    cell.put("unit", row.getUnit());
    cell.put("data_source", row.getSourceSite());
    cell.put("source_link", row.getSourceUrl());
    cell.put("quote_text", row.getQuoteText());
    cell.put("confidence", row.getConfidence());
    cell.put("published_at", row.getPublishedAt());
    cell.put("max_value", row.getMaxValue());
    cell.put("min_value", row.getMinValue());
    cell.put("fetch_task_id", row.getFetchTaskId());
    cell.put("collection_result_row_id", row.getId());
    cell.put("collected_at", collectedAt.toString());
    return cell;
  }

  private int mergeWideTableCells(String wideTableId, Integer rowId, Map<String, Object> cellsToWrite) {
    Map<String, Object> merged = readObjectMap(wideTableRowWriteRepository.getIndicatorValuesJson(wideTableId, rowId));
    merged.putAll(cellsToWrite);

    WideTableRowValuePatch patch = new WideTableRowValuePatch();
    patch.setWideTableId(wideTableId);
    patch.setRowId(rowId);
    patch.setIndicatorValuesJson(writeJson(merged));
    patch.setRowStatus("collected");
    return wideTableRowWriteRepository.updateIndicatorValues(patch);
  }

  private List<Map<String, Object>> parseNormalizedRows(String json) {
    if (json == null || json.trim().isEmpty()) {
      return Collections.emptyList();
    }
    try {
      JsonNode root = objectMapper.readTree(json);
      if (root != null && root.isTextual()) {
        root = objectMapper.readTree(root.asText());
      }
      if (root == null || !root.isArray()) {
        return Collections.emptyList();
      }
      return objectMapper.readValue(objectMapper.writeValueAsString(root), ROW_LIST_REF);
    } catch (Exception ignored) {
      return Collections.emptyList();
    }
  }

  private String valueByKnownColumn(Map<String, Object> row, ColumnKind kind) {
    if (row == null || row.isEmpty()) {
      return null;
    }
    for (Map.Entry<String, Object> entry : row.entrySet()) {
      if (matchesColumn(kind, entry.getKey())) {
        return asString(entry.getValue());
      }
    }
    return null;
  }

  private Map<String, Object> extractDimensionValues(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    if (row == null || row.isEmpty()) {
      return out;
    }
    for (Map.Entry<String, Object> entry : row.entrySet()) {
      String key = entry.getKey();
      if (key == null || isFixedMetricOrTechnicalColumn(key)) {
        continue;
      }
      out.put(key, entry.getValue());
    }
    return out;
  }

  private boolean isFixedMetricOrTechnicalColumn(String key) {
    String raw = key == null ? "" : key.trim();
    return COL_METRIC_NAME.equals(raw)
        || COL_VALUE.equals(raw)
        || COL_UNIT.equals(raw)
        || COL_DATA_PERIOD.equals(raw)
        || COL_DATA_SOURCE.equals(raw)
        || COL_NOTES.equals(raw)
        || COL_MIN_VALUE.equals(raw)
        || COL_MAX_VALUE.equals(raw)
        || COL_SOURCE_URL.equals(raw)
        || COL_SOURCE_EVIDENCE.equals(raw)
        || COL_ROW_ID.equals(raw)
        || COL_FETCH_TASK_ID.equals(raw)
        || COL_COLLECTION_RESULT_ID.equals(raw);
  }

  private String valueFromTechnicalColumn(Map<String, Object> row, String column) {
    if (row == null || column == null) {
      return null;
    }
    return trimToNull(asString(row.get(column)));
  }

  private Integer rowIdFromTechnicalColumn(Map<String, Object> row, Integer fallback) {
    String raw = valueFromTechnicalColumn(row, COL_ROW_ID);
    if (raw == null) {
      return fallback;
    }
    try {
      return Integer.valueOf(raw);
    } catch (NumberFormatException ignored) {
      return fallback;
    }
  }

  private boolean matchesColumn(ColumnKind kind, String key) {
    String raw = key == null ? "" : key.trim();
    String lower = raw.toLowerCase(Locale.ROOT);
    String compact = lower.replace(" ", "").replace("_", "").replace("-", "");
    switch (kind) {
      case METRIC_NAME:
        return lower.contains("metric name")
            || compact.equals("metric")
            || compact.contains("metricname")
            || raw.contains("\u6307\u6807\u540d\u79f0")
            || raw.contains("\u6307\u6807\u540d")
            || (raw.contains("\u6307\u6807") && raw.contains("\u540d\u79f0"));
      case VALUE:
        return lower.equals("value")
            || lower.contains("metric value")
            || compact.equals("value")
            || raw.contains("\u6307\u6807\u503c");
      case UNIT:
        return lower.equals("unit") || lower.contains("(unit)") || raw.contains("\u5355\u4f4d");
      case PUBLISHED_AT:
        return lower.contains("data period")
            || lower.contains("published")
            || lower.contains("date")
            || raw.contains("\u6570\u636e\u65f6\u95f4")
            || raw.contains("\u6570\u636e\u53d1\u5e03\u65f6\u95f4");
      case DATA_SOURCE:
        return compact.contains("datasource")
            || raw.contains("\u6570\u636e\u6765\u6e90")
            || raw.contains("\u6765\u6e90\u7ad9\u70b9");
      case NOTES:
        return compact.contains("notes")
            || compact.contains("reasoning")
            || compact.contains("logic")
            || raw.contains("\u903b\u8f91\u8bf4\u660e")
            || raw.contains("\u6307\u6807\u903b\u8f91")
            || raw.contains("\u903b\u8f91\u8865\u5145");
      case SOURCE_URL:
        return compact.contains("sourceurl") || lower.contains("source url") || raw.contains("\u6765\u6e90url");
      case QUOTE_TEXT:
        return compact.contains("sourceevidence")
            || lower.contains("evidence")
            || raw.contains("\u539f\u6587\u6458\u5f55")
            || raw.contains("\u8bc1\u636e");
      case MAX_VALUE:
        return compact.equals("maxvalue") || raw.contains("\u6700\u5927\u503c");
      case MIN_VALUE:
        return compact.equals("minvalue") || raw.contains("\u6700\u5c0f\u503c");
      default:
        return false;
    }
  }

  private Map<String, Object> readObjectMap(String json) {
    if (json == null || json.trim().isEmpty()) {
      return new LinkedHashMap<String, Object>();
    }
    try {
      Map<String, Object> raw = objectMapper.readValue(json, MAP_REF);
      return raw != null ? new LinkedHashMap<String, Object>(raw) : new LinkedHashMap<String, Object>();
    } catch (Exception ignored) {
      return new LinkedHashMap<String, Object>();
    }
  }

  private String writeJson(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception e) {
      throw new IllegalStateException("Failed to write JSON", e);
    }
  }

  private String cleanEmptyValue(String value) {
    String trimmed = trimToNull(value);
    if (trimmed == null || "-".equals(trimmed) || "—".equals(trimmed) || "NULL".equalsIgnoreCase(trimmed)) {
      return null;
    }
    return trimmed;
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String firstNonBlank(String first, String second) {
    String a = trimToNull(first);
    return a != null ? a : trimToNull(second);
  }

  private String asString(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private String buildStableId(String prefix, String... parts) {
    StringBuilder seed = new StringBuilder(prefix);
    if (parts != null) {
      for (String part : parts) {
        seed.append('|').append(part == null ? "" : part);
      }
    }
    return prefix + "_" + UUID.nameUUIDFromBytes(seed.toString().getBytes(StandardCharsets.UTF_8)).toString().replace("-", "");
  }

  private enum ColumnKind {
    METRIC_NAME,
    VALUE,
    UNIT,
    PUBLISHED_AT,
    DATA_SOURCE,
    NOTES,
    SOURCE_URL,
    QUOTE_TEXT,
    MAX_VALUE,
    MIN_VALUE
  }

  public static class MaterializationOutcome {
    private final String wideTableId;
    private final int collectionResults;
    private final int collectionResultRows;
    private final int wideTableCells;
    private final int skippedMissingRows;
    private final int skippedUnmappedMetrics;

    public MaterializationOutcome(
        String wideTableId,
        int collectionResults,
        int collectionResultRows,
        int wideTableCells,
        int skippedMissingRows,
        int skippedUnmappedMetrics) {
      this.wideTableId = wideTableId;
      this.collectionResults = collectionResults;
      this.collectionResultRows = collectionResultRows;
      this.wideTableCells = wideTableCells;
      this.skippedMissingRows = skippedMissingRows;
      this.skippedUnmappedMetrics = skippedUnmappedMetrics;
    }

    public String getWideTableId() {
      return wideTableId;
    }

    public int getCollectionResults() {
      return collectionResults;
    }

    public int getCollectionResultRows() {
      return collectionResultRows;
    }

    public int getWideTableCells() {
      return wideTableCells;
    }

    public int getSkippedMissingRows() {
      return skippedMissingRows;
    }

    public int getSkippedUnmappedMetrics() {
      return skippedUnmappedMetrics;
    }
  }
}
