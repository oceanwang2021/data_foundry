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
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CollectionResultAppService {
  private static final TypeReference<List<String>> STRING_LIST_REF =
      new TypeReference<List<String>>() {};
  private static final TypeReference<Map<String, Object>> MAP_REF =
      new TypeReference<Map<String, Object>>() {};
  private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");
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
  private static final String[] FIXED_METRIC_COLUMNS = new String[] {
      COL_METRIC_NAME,
      COL_VALUE,
      COL_UNIT,
      COL_DATA_PERIOD,
      COL_DATA_SOURCE,
      COL_NOTES,
      COL_MIN_VALUE,
      COL_MAX_VALUE,
      COL_SOURCE_URL,
      COL_SOURCE_EVIDENCE
  };

  private final CollectionResultRepository collectionResultRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final WideTableRowWriteRepository wideTableRowWriteRepository;
  private final WideTableReadRepository wideTableReadRepository;
  private final ObjectMapper objectMapper;

  public CollectionResultAppService(
      CollectionResultRepository collectionResultRepository,
      FetchTaskRepository fetchTaskRepository,
      WideTableRowWriteRepository wideTableRowWriteRepository,
      WideTableReadRepository wideTableReadRepository,
      ObjectMapper objectMapper) {
    this.collectionResultRepository = collectionResultRepository;
    this.fetchTaskRepository = fetchTaskRepository;
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

  public List<CollectionResult> listResultsByTaskGroup(String taskGroupId) {
    return collectionResultRepository.listResultsByTaskGroup(taskGroupId);
  }

  public List<CollectionResult> listResultsByWideTable(String wideTableId) {
    return collectionResultRepository.listResultsByWideTable(wideTableId);
  }

  public List<CollectionResultRow> listRowsByTask(String taskId) {
    return collectionResultRepository.listRowsByTask(taskId);
  }

  @Transactional
  public CollectionResult normalizeFinalReport(String taskId, String resultId) {
    if (taskId == null || taskId.trim().isEmpty() || resultId == null || resultId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Task id and result id are required");
    }
    String normalizedTaskId = taskId.trim();
    String normalizedResultId = resultId.trim();
    CollectionResult result =
        collectionResultRepository.getResultByTaskAndId(normalizedTaskId, normalizedResultId);
    if (result == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Collection result not found");
    }

    FetchTask task = fetchTaskRepository != null ? fetchTaskRepository.getById(normalizedTaskId) : null;
    List<Map<String, String>> rows = normalizeParsedRowsForTask(
        parseFirstMarkdownTable(result.getFinalReport()),
        task,
        result);
    String normalizedRowsJson = rows == null || rows.isEmpty() ? null : writeJson(rows);
    collectionResultRepository.updateNormalizedRowsJson(
        normalizedTaskId, normalizedResultId, normalizedRowsJson);
    result.setNormalizedRowsJson(normalizedRowsJson);
    return result;
  }

  @Transactional
  public List<CollectionResult> normalizeWideTableFinalReports(String wideTableId) {
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Wide table id is required");
    }
    return normalizeResults(collectionResultRepository.listResultsByWideTable(wideTableId.trim()));
  }

  @Transactional
  public List<CollectionResult> normalizeTaskGroupFinalReports(String taskGroupId) {
    if (taskGroupId == null || taskGroupId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Task group id is required");
    }
    return normalizeResults(collectionResultRepository.listResultsByTaskGroup(taskGroupId.trim()));
  }

  private List<CollectionResult> normalizeResults(List<CollectionResult> results) {
    for (CollectionResult result : results) {
      if (result == null || result.getId() == null || result.getFetchTaskId() == null) {
        continue;
      }
      FetchTask task = fetchTaskRepository != null ? fetchTaskRepository.getById(result.getFetchTaskId()) : null;
      List<Map<String, String>> rows = parseFirstMarkdownTable(result.getFinalReport());
      rows = normalizeParsedRowsForTask(rows, task, result);
      String normalizedRowsJson = rows == null || rows.isEmpty() ? null : writeJson(rows);
      collectionResultRepository.updateNormalizedRowsJson(
          result.getFetchTaskId(), result.getId(), normalizedRowsJson);
      result.setNormalizedRowsJson(normalizedRowsJson);
    }
    return results;
  }

  private List<Map<String, String>> normalizeParsedRowsForTask(
      List<Map<String, String>> parsedRows,
      FetchTask task,
      CollectionResult result) {
    if (parsedRows == null || parsedRows.isEmpty()) {
      return Collections.emptyList();
    }
    Map<String, String> taskDimensions =
        task != null ? readStringMap(task.getDimensionValuesJson()) : new LinkedHashMap<String, String>();
    String taskBusinessDate = task != null ? cleanText(task.getBusinessDate()) : null;
    List<Map<String, String>> out = new ArrayList<Map<String, String>>(parsedRows.size());
    for (Map<String, String> parsedRow : parsedRows) {
      if (parsedRow == null) {
        continue;
      }
      Map<String, String> normalized = new LinkedHashMap<String, String>();
      for (Map.Entry<String, String> entry : taskDimensions.entrySet()) {
        if (entry.getKey() != null && !entry.getKey().trim().isEmpty()) {
          normalized.put(entry.getKey(), entry.getValue() == null ? "" : entry.getValue());
        }
      }
      if (taskBusinessDate != null && !taskBusinessDate.trim().isEmpty() && !normalized.containsKey(COL_BUSINESS_DATE)) {
        normalized.put(COL_BUSINESS_DATE, taskBusinessDate);
      }
      for (String column : FIXED_METRIC_COLUMNS) {
        String value = valueByCanonicalColumn(parsedRow, column);
        normalized.put(column, value == null ? "" : value);
      }
      normalized.put(COL_ROW_ID, stringifyInteger(task != null ? task.getRowId() : result != null ? result.getRowId() : null));
      normalized.put(COL_FETCH_TASK_ID, firstNonBlank(result != null ? result.getFetchTaskId() : null, task != null ? task.getId() : null));
      if (normalized.get(COL_FETCH_TASK_ID) == null) {
        normalized.put(COL_FETCH_TASK_ID, "");
      }
      normalized.put(COL_COLLECTION_RESULT_ID, result != null && result.getId() != null ? result.getId() : "");
      out.add(normalized);
    }
    return out;
  }

  private String valueByCanonicalColumn(Map<String, String> row, String canonicalColumn) {
    if (row == null || row.isEmpty()) {
      return "";
    }
    for (Map.Entry<String, String> entry : row.entrySet()) {
      if (matchesCanonicalColumn(canonicalColumn, entry.getKey())) {
        return entry.getValue() == null ? "" : entry.getValue();
      }
    }
    return "";
  }

  private boolean matchesCanonicalColumn(String canonicalColumn, String key) {
    String raw = key == null ? "" : key.trim();
    String lower = raw.toLowerCase(Locale.ROOT);
    String compact = compactHeader(raw);
    if (COL_METRIC_NAME.equals(canonicalColumn)) {
      return compact.contains("metricname")
          || compact.equals("metric")
          || raw.contains("\u6307\u6807\u540d\u79f0")
          || raw.contains("\u6307\u6807\u540d");
    }
    if (COL_VALUE.equals(canonicalColumn)) {
      return lower.equals("value")
          || compact.equals("value")
          || compact.contains("metricvalue")
          || raw.contains("\u6307\u6807\u503c")
          || raw.contains("\u53d6\u503c");
    }
    if (COL_UNIT.equals(canonicalColumn)) {
      return lower.equals("unit")
          || compact.equals("unit")
          || raw.contains("\u5355\u4f4d");
    }
    if (COL_DATA_PERIOD.equals(canonicalColumn)) {
      return compact.contains("dataperiod")
          || compact.contains("publishedat")
          || raw.contains("\u6570\u636e\u65f6\u95f4")
          || raw.contains("\u6570\u636e\u53d1\u5e03\u65f6\u95f4");
    }
    if (COL_DATA_SOURCE.equals(canonicalColumn)) {
      return compact.contains("datasource")
          || raw.contains("\u6570\u636e\u6765\u6e90")
          || raw.contains("\u6765\u6e90\u7ad9\u70b9");
    }
    if (COL_NOTES.equals(canonicalColumn)) {
      return compact.contains("notes")
          || compact.contains("reasoning")
          || compact.contains("logic")
          || raw.contains("\u903b\u8f91\u8bf4\u660e")
          || raw.contains("\u6307\u6807\u903b\u8f91")
          || raw.contains("\u903b\u8f91\u8865\u5145");
    }
    if (COL_MIN_VALUE.equals(canonicalColumn)) {
      return compact.equals("minvalue") || raw.contains("\u6700\u5c0f\u503c");
    }
    if (COL_MAX_VALUE.equals(canonicalColumn)) {
      return compact.equals("maxvalue") || raw.contains("\u6700\u5927\u503c");
    }
    if (COL_SOURCE_URL.equals(canonicalColumn)) {
      return compact.contains("sourceurl") || raw.contains("\u6765\u6e90url");
    }
    if (COL_SOURCE_EVIDENCE.equals(canonicalColumn)) {
      return compact.contains("sourceevidence")
          || compact.contains("evidence")
          || raw.contains("\u539f\u6587\u6458\u5f55")
          || raw.contains("\u6eaf\u6e90\u6458\u8981")
          || raw.contains("\u8bc1\u636e");
    }
    return false;
  }

  private String compactHeader(String value) {
    if (value == null) {
      return "";
    }
    return value
        .toLowerCase(Locale.ROOT)
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
        .replace("\uff08", "")
        .replace("\uff09", "");
  }

  List<Map<String, String>> parseFirstMarkdownTable(String markdown) {
    return parseFirstMarkdownTable(markdown, null);
  }

  private List<Map<String, String>> parseFirstMarkdownTable(String markdown, List<String> forcedHeaders) {
    if (markdown == null || markdown.trim().isEmpty()) {
      return Collections.emptyList();
    }
    String[] lines = markdown.split("\\r?\\n");
    for (int i = 0; i < lines.length - 1; i++) {
      String headerLine = lines[i];
      String separatorLine = lines[i + 1];
      if (!looksLikeMarkdownRow(headerLine) || !looksLikeMarkdownRow(separatorLine)) {
        continue;
      }
      List<String> headers = normalizeHeaderCells(splitMarkdownRow(headerLine), splitMarkdownRow(separatorLine).size());
      if (headers.isEmpty() || !isMarkdownSeparator(separatorLine, headers.size())) {
        continue;
      }
      List<String> outputHeaders = forcedHeaders != null && !forcedHeaders.isEmpty() ? forcedHeaders : headers;
      if (outputHeaders.size() != headers.size()) {
        return Collections.emptyList();
      }
      List<Map<String, String>> rows = new ArrayList<Map<String, String>>();
      for (int j = i + 2; j < lines.length; j++) {
        String line = lines[j];
        if (!looksLikeMarkdownRow(line)) {
          break;
        }
        if (isMarkdownSeparator(line, headers.size())) {
          continue;
        }
        List<String> cells = splitMarkdownRow(line);
        cells = normalizeDataCells(cells, headers.size());
        Map<String, String> row = new LinkedHashMap<String, String>();
        for (int k = 0; k < outputHeaders.size(); k++) {
          row.put(outputHeaders.get(k), cells.get(k));
        }
        rows.add(row);
      }
      return rows;
    }
    List<Map<String, String>> looseRows = parseFirstLooseMarkdownTable(lines, forcedHeaders);
    if (!looseRows.isEmpty()) {
      return looseRows;
    }
    return Collections.emptyList();
  }

  private List<Map<String, String>> parseFirstLooseMarkdownTable(String[] lines, List<String> forcedHeaders) {
    if (lines == null || lines.length == 0) {
      return Collections.emptyList();
    }
    for (int i = 0; i < lines.length - 1; i++) {
      if (!looksLikeMarkdownRow(lines[i])) {
        continue;
      }
      List<String> rawHeaders = splitMarkdownRow(lines[i]);
      int firstDataIndex = findFirstLooseDataRow(lines, i + 1);
      if (firstDataIndex < 0) {
        continue;
      }
      List<String> firstDataCells = splitMarkdownRow(lines[firstDataIndex]);
      List<String> headers = normalizeLooseHeaderCells(rawHeaders, firstDataCells.size());
      if (!isLikelyMarkdownTableHeader(headers)) {
        continue;
      }
      List<String> outputHeaders = forcedHeaders != null && !forcedHeaders.isEmpty() ? forcedHeaders : headers;
      if (outputHeaders.size() != headers.size()) {
        return Collections.emptyList();
      }
      List<Map<String, String>> rows = new ArrayList<Map<String, String>>();
      for (int j = firstDataIndex; j < lines.length; j++) {
        String line = lines[j];
        if (!looksLikeMarkdownRow(line)) {
          break;
        }
        if (isMarkdownSeparator(line, splitMarkdownRow(line).size())) {
          continue;
        }
        List<String> cells = normalizeDataCells(splitMarkdownRow(line), headers.size());
        Map<String, String> row = new LinkedHashMap<String, String>();
        for (int k = 0; k < outputHeaders.size(); k++) {
          row.put(outputHeaders.get(k), cells.get(k));
        }
        rows.add(row);
      }
      return rows;
    }
    return Collections.emptyList();
  }

  private List<String> parseFirstMarkdownTableHeaders(String markdown) {
    if (markdown == null || markdown.trim().isEmpty()) {
      return Collections.emptyList();
    }
    String[] lines = markdown.split("\\r?\\n");
    for (int i = 0; i < lines.length - 1; i++) {
      String headerLine = lines[i];
      String separatorLine = lines[i + 1];
      if (!looksLikeMarkdownRow(headerLine) || !looksLikeMarkdownRow(separatorLine)) {
        continue;
      }
      List<String> headers = normalizeHeaderCells(splitMarkdownRow(headerLine), splitMarkdownRow(separatorLine).size());
      if (!headers.isEmpty() && isMarkdownSeparator(separatorLine, headers.size())) {
        return headers;
      }
    }
    return Collections.emptyList();
  }

  private boolean looksLikeMarkdownRow(String line) {
    return line != null && line.indexOf('|') >= 0;
  }

  private List<String> normalizeHeaderCells(List<String> headers, int separatorColumns) {
    if (headers == null || headers.isEmpty()) {
      return Collections.emptyList();
    }
    if (headers.size() == separatorColumns + 1 && isTableMetadataHeader(headers.get(0))) {
      return new ArrayList<String>(headers.subList(1, headers.size()));
    }
    return headers;
  }

  private List<String> normalizeLooseHeaderCells(List<String> headers, int dataColumns) {
    if (headers == null || headers.isEmpty()) {
      return Collections.emptyList();
    }
    if (isTableMetadataHeader(headers.get(0)) && headers.size() == dataColumns + 1) {
      return new ArrayList<String>(headers.subList(1, headers.size()));
    }
    return headers;
  }

  private boolean isTableMetadataHeader(String value) {
    if (value == null) {
      return false;
    }
    String trimmed = value.trim();
    return trimmed.startsWith("#") || trimmed.toLowerCase().startsWith("table:") || trimmed.contains("表名");
  }

  private List<String> splitMarkdownRow(String line) {
    if (line == null) {
      return Collections.emptyList();
    }
    String value = line.trim();
    if (value.startsWith("|")) {
      value = value.substring(1);
    }
    if (value.endsWith("|")) {
      value = value.substring(0, value.length() - 1);
    }
    String[] parts = value.split("\\|", -1);
    List<String> out = new ArrayList<String>();
    for (String part : parts) {
      out.add(part == null ? "" : part.trim());
    }
    return out;
  }

  private boolean isMarkdownSeparator(String line, int expectedColumns) {
    List<String> cells = splitMarkdownRow(line);
    if (cells.size() != expectedColumns || cells.isEmpty()) {
      return false;
    }
    for (String cell : cells) {
      if (cell == null || !cell.trim().matches(":?-{3,}:?")) {
        return false;
      }
    }
    return true;
  }

  private int findFirstLooseDataRow(String[] lines, int start) {
    for (int i = start; i < lines.length; i++) {
      if (!looksLikeMarkdownRow(lines[i])) {
        return -1;
      }
      List<String> cells = splitMarkdownRow(lines[i]);
      if (isMarkdownSeparator(lines[i], cells.size())) {
        continue;
      }
      return i;
    }
    return -1;
  }

  private boolean isLikelyMarkdownTableHeader(List<String> headers) {
    if (headers == null || headers.size() < 2) {
      return false;
    }
    int score = 0;
    for (String header : headers) {
      String value = header == null ? "" : header.trim();
      String lower = value.toLowerCase(Locale.ROOT);
      String compact = lower.replace(" ", "").replace("_", "").replace("-", "");
      if ("comcode".equals(compact)
          || compact.contains("metricname")
          || compact.contains("metricvalue")
          || compact.contains("dataperiod")
          || compact.contains("datasource")
          || compact.contains("sourceurl")
          || compact.contains("sourceevidence")
          || "unit".equals(compact)
          || "minvalue".equals(compact)
          || "maxvalue".equals(compact)
          || value.contains("\u6307\u6807\u540d")
          || value.contains("\u6307\u6807\u503c")
          || value.contains("\u6570\u636e\u65f6\u95f4")
          || value.contains("\u6570\u636e\u6765\u6e90")
          || value.contains("\u5355\u4f4d")) {
        score++;
      }
    }
    return score >= 2;
  }

  private List<String> normalizeDataCells(List<String> cells, int expectedColumns) {
    List<String> normalized = new ArrayList<String>(cells != null ? cells : Collections.<String>emptyList());
    if (expectedColumns <= 0) {
      return normalized;
    }
    while (normalized.size() < expectedColumns) {
      normalized.add("");
    }
    if (normalized.size() <= expectedColumns) {
      return normalized;
    }
    List<String> aligned = new ArrayList<String>(normalized.subList(0, expectedColumns - 1));
    StringBuilder tail = new StringBuilder();
    for (int i = expectedColumns - 1; i < normalized.size(); i++) {
      if (tail.length() > 0) {
        tail.append(" | ");
      }
      tail.append(normalized.get(i));
    }
    aligned.add(tail.toString());
    return aligned;
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
    row.setSourceMetricName(firstNonBlank(source.getIndicatorName(), source.getIndicatorKey(), source.getIndicatorColumn()));
    row.setTargetIndicatorKey(key);
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

  private String stringifyInteger(Integer value) {
    return value == null ? "" : String.valueOf(value.intValue());
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
