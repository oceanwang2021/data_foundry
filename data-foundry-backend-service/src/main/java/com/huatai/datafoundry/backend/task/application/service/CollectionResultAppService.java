package com.huatai.datafoundry.backend.task.application.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.application.command.SchedulerExecutionCallbackCommand;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;
import com.huatai.datafoundry.backend.task.domain.model.WideTableRowValuePatch;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableReadRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableRowWriteRepository;
import com.huatai.datafoundry.contract.agent.AgentExecutionResponse;
import com.huatai.datafoundry.contract.agent.NarrowIndicatorRow;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CollectionResultAppService {
  private static final TypeReference<List<String>> STRING_LIST_REF =
      new TypeReference<List<String>>() {};
  private static final TypeReference<Map<String, Object>> MAP_REF =
      new TypeReference<Map<String, Object>>() {};
  private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");

  private final CollectionResultRepository collectionResultRepository;
  private final WideTableRowWriteRepository wideTableRowWriteRepository;
  private final WideTableReadRepository wideTableReadRepository;
  private final ObjectMapper objectMapper;

  public CollectionResultAppService(
      CollectionResultRepository collectionResultRepository,
      WideTableRowWriteRepository wideTableRowWriteRepository,
      WideTableReadRepository wideTableReadRepository,
      ObjectMapper objectMapper) {
    this.collectionResultRepository = collectionResultRepository;
    this.wideTableRowWriteRepository = wideTableRowWriteRepository;
    this.wideTableReadRepository = wideTableReadRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public ProcessingOutcome storeAndApply(FetchTask task, SchedulerExecutionCallbackCommand command) {
    ProcessingOutcome outcome = new ProcessingOutcome();
    if (task == null || command == null || command.getAgentResult() == null) {
      outcome.taskStatus = "failed";
      outcome.resultStatus = "failed";
      outcome.errorMessage = "Agent result is missing";
      return outcome;
    }

    AgentExecutionResponse agentResult = command.getAgentResult();
    List<NarrowIndicatorRow> normalizedRows =
        agentResult.getNormalizedRows() != null
            ? agentResult.getNormalizedRows()
            : Collections.<NarrowIndicatorRow>emptyList();

    String resultId = buildStableId("cr", command.getScheduleJobId(), task.getId());
    String resultStatus = resolveResultStatus(agentResult, normalizedRows);
    LocalDateTime collectedAt = LocalDateTime.now();

    CollectionResult result = new CollectionResult();
    result.setId(resultId);
    result.setFetchTaskId(task.getId());
    result.setScheduleJobId(command.getScheduleJobId());
    result.setExternalTaskId(firstNonBlank(agentResult.getExternalTaskId(), agentResult.getTaskId()));
    result.setTaskGroupId(task.getTaskGroupId());
    result.setBatchId(task.getBatchId());
    result.setWideTableId(task.getWideTableId());
    result.setRowId(task.getRowId());
    result.setRawResultJson(writeJson(agentResult.getRawResult()));
    result.setFinalReport(agentResult.getFinalReport());
    result.setNormalizedRowsJson(writeJson(normalizedRows));
    result.setStatus(resultStatus);
    result.setErrorMsg(agentResult.getErrorMessage());
    result.setDurationMs(agentResult.getDurationMs());
    result.setCollectedAt(collectedAt);
    collectionResultRepository.upsertResult(result);

    collectionResultRepository.deleteRowsByResultId(resultId);

    List<String> expectedKeys = parseExpectedKeys(task.getIndicatorKeysJson());
    Set<String> expectedKeySet = new LinkedHashSet<String>(expectedKeys);
    Map<String, String> taskDimensions = readStringMap(task.getDimensionValuesJson());
    Map<String, IndicatorMeta> indicatorMetaByKey = loadIndicatorMeta(task);
    List<CollectionResultRow> resultRows = new ArrayList<CollectionResultRow>();
    Map<String, Object> cellsToWrite = new LinkedHashMap<String, Object>();
    int acceptedCount = 0;
    BigDecimal confidenceSum = BigDecimal.ZERO;
    int confidenceCount = 0;

    int index = 0;
    for (NarrowIndicatorRow row : normalizedRows) {
      RowBuildResult built =
          buildResultRow(
              row,
              task,
              command,
              resultId,
              index++,
              expectedKeySet,
              taskDimensions,
              indicatorMetaByKey,
              collectedAt);
      resultRows.add(built.row);
      if ("accepted".equals(built.row.getStatus())) {
        acceptedCount++;
        if (built.row.getConfidence() != null) {
          confidenceSum = confidenceSum.add(built.row.getConfidence());
          confidenceCount++;
        }
        if (built.cell != null) {
          cellsToWrite.put(built.row.getIndicatorKey(), built.cell);
        }
      }
    }

    collectionResultRepository.insertRows(resultRows);
    if (!cellsToWrite.isEmpty()) {
      mergeWideTableCells(task.getWideTableId(), task.getRowId(), cellsToWrite);
    }

    outcome.resultId = resultId;
    outcome.resultStatus = resultStatus;
    outcome.acceptedRows = acceptedCount;
    outcome.totalRows = resultRows.size();
    outcome.taskStatus = shouldMarkTaskFailed(agentResult, normalizedRows) ? "failed" : "completed";
    outcome.errorMessage = shouldMarkTaskFailed(agentResult, normalizedRows)
        ? firstNonBlank(agentResult.getErrorMessage(), "No recognizable agent result rows")
        : null;
    outcome.confidence =
        confidenceCount > 0
            ? confidenceSum.divide(new BigDecimal(confidenceCount), 4, BigDecimal.ROUND_HALF_UP)
            : null;
    return outcome;
  }

  public List<CollectionResult> listResultsByTask(String taskId) {
    return collectionResultRepository.listResultsByTask(taskId);
  }

  public List<CollectionResultRow> listRowsByTask(String taskId) {
    return collectionResultRepository.listRowsByTask(taskId);
  }

  private RowBuildResult buildResultRow(
      NarrowIndicatorRow source,
      FetchTask task,
      SchedulerExecutionCallbackCommand command,
      String resultId,
      int index,
      Set<String> expectedKeys,
      Map<String, String> taskDimensions,
      Map<String, IndicatorMeta> indicatorMetaByKey,
      LocalDateTime collectedAt) {
    String key = normalizeIndicatorKey(firstNonBlank(source.getIndicatorKey(), source.getIndicatorColumn()));
    IndicatorMeta meta = indicatorMetaByKey.get(key);
    Map<String, String> dimensions = mergeDimensions(taskDimensions, source.getDimensionValues());
    String warning = null;
    String status = "accepted";

    if (key == null || key.trim().isEmpty()) {
      key = "unknown_" + index;
      status = "rejected";
      warning = appendWarning(warning, "indicator key is missing");
    } else if (!expectedKeys.isEmpty() && !expectedKeys.contains(key)) {
      status = "rejected";
      warning = appendWarning(warning, "indicator key is not expected by current fetch task");
    }

    String dimensionConflict = findDimensionConflict(taskDimensions, source.getDimensionValues());
    if (dimensionConflict != null) {
      status = "rejected";
      warning = appendWarning(warning, dimensionConflict);
    }

    String rawValue = firstNonBlank(source.getRawValue(), source.getValue());
    String cleanedValue = cleanByType(firstNonBlank(source.getValue(), rawValue), meta != null ? meta.dataType : null);
    if ((cleanedValue == null || cleanedValue.trim().isEmpty()) && "accepted".equals(status)) {
      status = "not_found";
      warning = appendWarning(warning, firstNonBlank(source.getWhyNotFound(), "value is empty"));
    }

    CollectionResultRow row = new CollectionResultRow();
    row.setId(buildStableId("crr", resultId, key, String.valueOf(index)));
    row.setCollectionResultId(resultId);
    row.setFetchTaskId(task.getId());
    row.setScheduleJobId(command.getScheduleJobId());
    row.setWideTableId(task.getWideTableId());
    row.setRowId(task.getRowId());
    row.setIndicatorKey(key);
    row.setIndicatorName(firstNonBlank(source.getIndicatorName(), meta != null ? meta.name : null, key));
    row.setBusinessDate(firstNonBlank(source.getBusinessDate(), task.getBusinessDate()));
    row.setDimensionValuesJson(writeJson(dimensions));
    row.setRawValue(cleanText(rawValue));
    row.setCleanedValue(cleanedValue);
    row.setUnit(firstNonBlank(source.getUnit(), meta != null ? meta.unit : null));
    row.setPublishedAt(cleanText(source.getPublishedAt()));
    row.setSourceSite(cleanText(source.getSourceSite()));
    row.setSourceUrl(cleanText(source.getSourceUrl()));
    row.setQuoteText(cleanText(source.getQuoteText()));
    row.setMaxValue(cleanText(source.getMaxValue()));
    row.setMinValue(cleanText(source.getMinValue()));
    row.setConfidence(source.getConfidence() != null ? BigDecimal.valueOf(source.getConfidence().doubleValue()) : null);
    row.setStatus(status);
    row.setWarningMsg(warning);
    row.setReasoning(cleanText(source.getReasoning()));
    row.setWhyNotFound(cleanText(source.getWhyNotFound()));

    RowBuildResult out = new RowBuildResult();
    out.row = row;
    if ("accepted".equals(status)) {
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
      cell.put("fetch_task_id", task.getId());
      cell.put("collection_result_row_id", row.getId());
      cell.put("collected_at", collectedAt.toString());
      out.cell = cell;
    }
    return out;
  }

  private void mergeWideTableCells(String wideTableId, Integer rowId, Map<String, Object> cellsToWrite) {
    if (wideTableId == null || rowId == null || cellsToWrite == null || cellsToWrite.isEmpty()) {
      return;
    }
    Map<String, Object> merged = readObjectMap(wideTableRowWriteRepository.getIndicatorValuesJson(wideTableId, rowId));
    merged.putAll(cellsToWrite);

    WideTableRowValuePatch patch = new WideTableRowValuePatch();
    patch.setWideTableId(wideTableId);
    patch.setRowId(rowId);
    patch.setIndicatorValuesJson(writeJson(merged));
    patch.setRowStatus("collected");
    wideTableRowWriteRepository.updateIndicatorValues(patch);
  }

  private boolean shouldMarkTaskFailed(AgentExecutionResponse agentResult, List<NarrowIndicatorRow> rows) {
    if (agentResult == null) {
      return true;
    }
    if ("failed".equalsIgnoreCase(agentResult.getStatus())) {
      return true;
    }
    return rows == null || rows.isEmpty();
  }

  private String resolveResultStatus(AgentExecutionResponse agentResult, List<NarrowIndicatorRow> rows) {
    if (agentResult == null) {
      return "failed";
    }
    String status = agentResult.getStatus();
    if (status == null || status.trim().isEmpty()) {
      status = rows == null || rows.isEmpty() ? "failed" : "success";
    }
    if ("completed".equalsIgnoreCase(status)) {
      return rows == null || rows.isEmpty() ? "failed" : "success";
    }
    if ("success".equalsIgnoreCase(status)
        || "partial".equalsIgnoreCase(status)
        || "not_found".equalsIgnoreCase(status)
        || "conflict".equalsIgnoreCase(status)
        || "failed".equalsIgnoreCase(status)) {
      return status.toLowerCase(Locale.ROOT);
    }
    return rows == null || rows.isEmpty() ? "failed" : "success";
  }

  private List<String> parseExpectedKeys(String rawJson) {
    if (rawJson == null || rawJson.trim().isEmpty()) {
      return Collections.emptyList();
    }
    try {
      List<String> raw = objectMapper.readValue(rawJson, STRING_LIST_REF);
      List<String> out = new ArrayList<String>();
      for (String value : raw) {
        String key = normalizeIndicatorKey(value);
        if (key != null && !key.trim().isEmpty()) {
          out.add(key);
        }
      }
      return out;
    } catch (Exception ignored) {
      return Collections.emptyList();
    }
  }

  private Map<String, IndicatorMeta> loadIndicatorMeta(FetchTask task) {
    if (task == null) {
      return Collections.emptyMap();
    }
    WideTablePlanSource wideTable =
        wideTableReadRepository.getByIdForRequirement(task.getRequirementId(), task.getWideTableId());
    if (wideTable == null || wideTable.getSchemaJson() == null) {
      return Collections.emptyMap();
    }
    Map<String, IndicatorMeta> out = new HashMap<String, IndicatorMeta>();
    try {
      Map<String, Object> schema = objectMapper.readValue(wideTable.getSchemaJson(), MAP_REF);
      Object indicators = schema.get("indicator_columns");
      if (!(indicators instanceof List)) {
        indicators = schema.get("columns");
      }
      if (indicators instanceof List) {
        for (Object item : (List<?>) indicators) {
          if (!(item instanceof Map)) {
            continue;
          }
          Map<?, ?> raw = (Map<?, ?>) item;
          String key = normalizeIndicatorKey(asString(firstNonNull(raw.get("key"), raw.get("name"))));
          if (key == null || key.trim().isEmpty()) {
            continue;
          }
          IndicatorMeta meta = new IndicatorMeta();
          meta.key = key;
          meta.name = asString(firstNonNull(raw.get("name"), raw.get("chinese_name"), raw.get("key")));
          meta.dataType = asString(firstNonNull(raw.get("data_type"), raw.get("type")));
          meta.unit = asString(raw.get("unit"));
          out.put(key, meta);
        }
      }
    } catch (Exception ignored) {
      return Collections.emptyMap();
    }
    return out;
  }

  private Map<String, String> mergeDimensions(Map<String, String> taskDimensions, Map<String, String> rowDimensions) {
    Map<String, String> out = new LinkedHashMap<String, String>();
    if (taskDimensions != null) {
      out.putAll(taskDimensions);
    }
    if (rowDimensions != null) {
      for (Map.Entry<String, String> entry : rowDimensions.entrySet()) {
        if (entry.getKey() != null) {
          out.put(entry.getKey(), entry.getValue());
        }
      }
    }
    return out;
  }

  private String findDimensionConflict(Map<String, String> taskDimensions, Map<String, String> rowDimensions) {
    if (taskDimensions == null || taskDimensions.isEmpty() || rowDimensions == null || rowDimensions.isEmpty()) {
      return null;
    }
    for (Map.Entry<String, String> entry : taskDimensions.entrySet()) {
      String key = entry.getKey();
      if (key == null || !rowDimensions.containsKey(key)) {
        continue;
      }
      String expected = normalizeText(entry.getValue());
      String actual = normalizeText(rowDimensions.get(key));
      if (!expected.isEmpty() && !actual.isEmpty() && !expected.equals(actual)) {
        return "dimension conflict on " + key + ": expected " + entry.getValue() + ", got " + rowDimensions.get(key);
      }
    }
    return null;
  }

  private String cleanByType(String value, String dataType) {
    String cleaned = cleanText(value);
    if (cleaned == null || cleaned.trim().isEmpty()) {
      return null;
    }
    String type = dataType != null ? dataType.trim().toUpperCase(Locale.ROOT) : "";
    if ("NUMBER".equals(type) || "DECIMAL".equals(type) || "DOUBLE".equals(type) || "FLOAT".equals(type)) {
      return cleanNumber(cleaned, false);
    }
    if ("INTEGER".equals(type) || "INT".equals(type) || "BIGINT".equals(type)) {
      return cleanNumber(cleaned, true);
    }
    if ("DATE".equals(type)) {
      return cleaned.replace('/', '-').replace('.', '-');
    }
    return cleaned;
  }

  private String cleanNumber(String value, boolean integer) {
    if (value == null) {
      return null;
    }
    String cleaned = value.replace(",", "").replace("%", "").trim();
    try {
      BigDecimal decimal = new BigDecimal(cleaned);
      if (integer) {
        return String.valueOf(decimal.setScale(0, BigDecimal.ROUND_HALF_UP).longValue());
      }
      return decimal.stripTrailingZeros().toPlainString();
    } catch (Exception ignored) {
      return value;
    }
  }

  private Map<String, String> readStringMap(String json) {
    Map<String, String> out = new LinkedHashMap<String, String>();
    if (json == null || json.trim().isEmpty()) {
      return out;
    }
    try {
      Map<String, Object> raw = objectMapper.readValue(json, MAP_REF);
      for (Map.Entry<String, Object> entry : raw.entrySet()) {
        out.put(entry.getKey(), entry.getValue() == null ? "" : String.valueOf(entry.getValue()));
      }
    } catch (Exception ignored) {
      return out;
    }
    return out;
  }

  private Map<String, Object> readObjectMap(String json) {
    if (json == null || json.trim().isEmpty()) {
      return new LinkedHashMap<String, Object>();
    }
    try {
      Map<String, Object> raw = objectMapper.readValue(json, MAP_REF);
      return raw != null ? raw : new LinkedHashMap<String, Object>();
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
    } catch (Exception ignored) {
      return null;
    }
  }

  private String normalizeIndicatorKey(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    int space = trimmed.indexOf(' ');
    int paren = trimmed.indexOf('(');
    int fullParen = trimmed.indexOf('（');
    int cut = -1;
    if (space >= 0) cut = space;
    if (paren >= 0 && (cut < 0 || paren < cut)) cut = paren;
    if (fullParen >= 0 && (cut < 0 || fullParen < cut)) cut = fullParen;
    return cut > 0 ? trimmed.substring(0, cut) : trimmed;
  }

  private String cleanText(String value) {
    if (value == null) {
      return null;
    }
    String cleaned = value.trim();
    if (cleaned.isEmpty() || "null".equalsIgnoreCase(cleaned)) {
      return null;
    }
    cleaned = cleaned.replace("<br/>", "\n").replace("<br />", "\n").replace("<br>", "\n");
    cleaned = HTML_TAG.matcher(cleaned).replaceAll("");
    cleaned = cleaned.replace("\\n", "\n").replace("&nbsp;", " ").trim();
    return cleaned;
  }

  private String normalizeText(String value) {
    String cleaned = cleanText(value);
    return cleaned == null ? "" : cleaned.trim();
  }

  private String asString(Object value) {
    return value == null ? null : String.valueOf(value);
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

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (value != null && value.trim().length() > 0) {
        return value;
      }
    }
    return null;
  }

  private String appendWarning(String current, String next) {
    if (next == null || next.trim().isEmpty()) {
      return current;
    }
    if (current == null || current.trim().isEmpty()) {
      return next;
    }
    return current + "; " + next;
  }

  private String buildStableId(String prefix, String... parts) {
    StringBuilder sb = new StringBuilder(prefix);
    if (parts != null) {
      for (String part : parts) {
        sb.append('|').append(part == null ? "" : part);
      }
    }
    UUID uuid = UUID.nameUUIDFromBytes(sb.toString().getBytes(StandardCharsets.UTF_8));
    return prefix + "_" + uuid.toString();
  }

  private static class IndicatorMeta {
    private String key;
    private String name;
    private String dataType;
    private String unit;
  }

  private static class RowBuildResult {
    private CollectionResultRow row;
    private Map<String, Object> cell;
  }

  public static class ProcessingOutcome {
    private String resultId;
    private String resultStatus;
    private String taskStatus;
    private String errorMessage;
    private int acceptedRows;
    private int totalRows;
    private BigDecimal confidence;

    public String getResultId() {
      return resultId;
    }

    public String getResultStatus() {
      return resultStatus;
    }

    public String getTaskStatus() {
      return taskStatus;
    }

    public String getErrorMessage() {
      return errorMessage;
    }

    public int getAcceptedRows() {
      return acceptedRows;
    }

    public int getTotalRows() {
      return totalRows;
    }

    public BigDecimal getConfidence() {
      return confidence;
    }
  }
}
