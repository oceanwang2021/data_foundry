package com.huatai.datafoundry.backend.targettable.application.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TargetTablePublishAppService {
  private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[A-Za-z0-9_]+$");
  private static final TypeReference<Map<String, Object>> MAP_REF =
      new TypeReference<Map<String, Object>>() {};

  private final WideTableMapper wideTableMapper;
  private final WideTableRowMapper wideTableRowMapper;
  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final String targetSchema;

  public TargetTablePublishAppService(
      WideTableMapper wideTableMapper,
      WideTableRowMapper wideTableRowMapper,
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      @Value("${datafoundry.target-tables.schema:target_tables}") String targetSchema) {
    this.wideTableMapper = wideTableMapper;
    this.wideTableRowMapper = wideTableRowMapper;
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.targetSchema = targetSchema;
  }

  @Transactional
  public TargetPublishOutcome publishWideTable(String wideTableId, String taskGroupId) {
    return publishWideTable(wideTableId, taskGroupId, null);
  }

  @Transactional
  public TargetPublishOutcome publishWideTable(String wideTableId, String taskGroupId, List<Integer> rowIds) {
    String normalizedWideTableId = trimToNull(wideTableId);
    if (normalizedWideTableId == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wideTableId is required");
    }
    WideTableRecord wideTable = wideTableMapper.getById(normalizedWideTableId);
    if (wideTable == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }

    String schema = requireSafeIdentifier(targetSchema, "target schema");
    String tableName = requireSafeIdentifier(wideTable.getTableName(), "target table");
    String jobId = "TPJ-" + UUID.randomUUID().toString().replace("-", "").substring(0, 24);
    LocalDateTime now = LocalDateTime.now();
    insertJob(jobId, wideTable, trimToNull(taskGroupId), schema, tableName, now);

    TargetPublishOutcome outcome = new TargetPublishOutcome();
    outcome.setJobId(jobId);
    outcome.setRequirementId(wideTable.getRequirementId());
    outcome.setWideTableId(wideTable.getId());
    outcome.setTaskGroupId(trimToNull(taskGroupId));
    outcome.setTargetSchema(schema);
    outcome.setTargetTable(tableName);

    try {
      PublishSchema publishSchema = parsePublishSchema(wideTable.getSchemaJson());
      validateTargetTable(schema, tableName, publishSchema);
      List<WideTableRowRecord> rows = filterRows(wideTableRowMapper.listByWideTableId(normalizedWideTableId), rowIds);
      outcome.setTotalRows(rows != null ? rows.size() : 0);
      if (rows != null) {
        for (WideTableRowRecord row : rows) {
          try {
            publishRow(jobId, wideTable, schema, tableName, publishSchema, row, outcome);
          } catch (Exception rowError) {
            outcome.failedRows++;
            insertRowLog(
                jobId,
                wideTable,
                row,
                "skip",
                "failed",
                rootMessage(rowError),
                readMap(row.getDimensionValuesJson()),
                new LinkedHashMap<String, Object>());
          }
        }
      }
      String status = outcome.getFailedRows() > 0 ? "partial_failed" : "success";
      outcome.setStatus(status);
      updateJob(jobId, outcome, null, now);
      return outcome;
    } catch (Exception ex) {
      String message = rootMessage(ex);
      outcome.setStatus("failed");
      outcome.setErrorMsg(message);
      outcome.setFailedRows(Math.max(outcome.getFailedRows(), 1));
      updateJob(jobId, outcome, message, now);
      return outcome;
    }
  }

  public TargetComparisonOutcome compareWideTableWithTarget(String wideTableId) {
    String normalizedWideTableId = trimToNull(wideTableId);
    if (normalizedWideTableId == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wideTableId is required");
    }
    WideTableRecord wideTable = wideTableMapper.getById(normalizedWideTableId);
    if (wideTable == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }

    String schema = requireSafeIdentifier(targetSchema, "target schema");
    String tableName = requireSafeIdentifier(wideTable.getTableName(), "target table");
    PublishSchema publishSchema = parsePublishSchema(wideTable.getSchemaJson());
    validateTargetTable(schema, tableName, publishSchema);
    Set<String> targetColumns = loadTargetColumns(schema, tableName);
    boolean hasIdColumn = targetColumns.contains("ID");

    TargetComparisonOutcome outcome = new TargetComparisonOutcome();
    outcome.setRequirementId(wideTable.getRequirementId());
    outcome.setWideTableId(wideTable.getId());
    outcome.setTargetSchema(schema);
    outcome.setTargetTable(tableName);

    List<WideTableRowRecord> rows = wideTableRowMapper.listByWideTableId(normalizedWideTableId);
    outcome.setTotalRows(rows != null ? rows.size() : 0);
    if (rows == null || rows.isEmpty()) {
      outcome.setStatus("empty");
      return outcome;
    }

    for (WideTableRowRecord row : rows) {
      TargetComparisonRow rowOutcome = compareRow(schema, tableName, publishSchema, hasIdColumn, row);
      outcome.getRows().add(rowOutcome);
      if ("matched".equals(rowOutcome.getStatus())) {
        outcome.matchedRows++;
      } else if ("missing_dimension".equals(rowOutcome.getStatus()) || "failed".equals(rowOutcome.getStatus())) {
        outcome.failedRows++;
      } else {
        outcome.missingRows++;
      }
    }
    outcome.setStatus(outcome.getFailedRows() > 0 ? "partial_failed" : "success");
    return outcome;
  }

  private TargetComparisonRow compareRow(
      String schema,
      String tableName,
      PublishSchema publishSchema,
      boolean hasIdColumn,
      WideTableRowRecord row) {
    TargetComparisonRow out = new TargetComparisonRow();
    out.setRowId(row.getRowId());
    try {
      Map<String, Object> dimensionValues = readMap(row.getDimensionValuesJson());
      Map<String, Object> dimensions = new LinkedHashMap<String, Object>();
      for (String column : publishSchema.dimensionColumns) {
        Object value = normalizeValue(dimensionValues.get(column));
        if (value == null && isBusinessDateColumn(publishSchema, column)) {
          value = normalizeValue(row.getBusinessDate());
        }
        if (value == null) {
          out.setStatus("missing_dimension");
          out.setMessage("missing dimension: " + column);
          out.setDimensionValues(dimensions);
          return out;
        }
        dimensions.put(column, value);
      }
      out.setDimensionValues(dimensions);
      Map<String, Object> values = findLatestTargetValues(schema, tableName, publishSchema.indicatorColumns, dimensions, hasIdColumn);
      if (values == null) {
        out.setStatus("not_found");
        out.setPreviousValues(new LinkedHashMap<String, Object>());
        return out;
      }
      out.setStatus("matched");
      out.setPreviousValues(values);
      return out;
    } catch (Exception ex) {
      out.setStatus("failed");
      out.setMessage(rootMessage(ex));
      return out;
    }
  }

  private void publishRow(
      String jobId,
      WideTableRecord wideTable,
      String schema,
      String tableName,
      PublishSchema publishSchema,
      WideTableRowRecord row,
      TargetPublishOutcome outcome) {
    Map<String, Object> dimensionValues = readMap(row.getDimensionValuesJson());
    Map<String, Object> indicatorValues = readMap(row.getIndicatorValuesJson());
    Map<String, Object> dimensions = new LinkedHashMap<String, Object>();
    Map<String, Object> allInsertValues = new LinkedHashMap<String, Object>();
    Map<String, Object> nonEmptyUpdateValues = new LinkedHashMap<String, Object>();

    for (String column : publishSchema.dimensionColumns) {
      Object value = normalizeValue(dimensionValues.get(column));
      if (value == null && isBusinessDateColumn(publishSchema, column)) {
        value = normalizeValue(row.getBusinessDate());
      }
      if (value == null) {
        outcome.failedRows++;
        insertRowLog(jobId, wideTable, row, "skip", "failed", "missing dimension: " + column, dimensions, allInsertValues);
        return;
      }
      dimensions.put(column, value);
      allInsertValues.put(column, value);
    }

    for (String column : publishSchema.indicatorColumns) {
      Object value = normalizeValue(extractCellValue(indicatorValues.get(column)));
      allInsertValues.put(column, value);
      if (value != null) {
        nonEmptyUpdateValues.put(column, value);
      }
    }

    int matches = countTargetRows(schema, tableName, dimensions);
    if (matches > 1) {
      outcome.failedRows++;
      insertRowLog(jobId, wideTable, row, "skip", "failed", "dimension group matched multiple target rows", dimensions, allInsertValues);
      return;
    }
    if (matches == 0) {
      if (publishSchema.hasIdColumn && !containsColumnIgnoreCase(allInsertValues, "ID")) {
        allInsertValues.put("ID", nextTargetId(schema, tableName));
      }
      insertTargetRow(schema, tableName, allInsertValues);
      outcome.insertedRows++;
      insertRowLog(jobId, wideTable, row, "insert", "success", null, dimensions, allInsertValues);
      return;
    }
    if (nonEmptyUpdateValues.isEmpty()) {
      outcome.skippedRows++;
      insertRowLog(jobId, wideTable, row, "skip", "skipped_no_non_empty_values", null, dimensions, nonEmptyUpdateValues);
      return;
    }
    updateTargetRow(schema, tableName, nonEmptyUpdateValues, dimensions);
    outcome.updatedRows++;
    insertRowLog(jobId, wideTable, row, "update", "success", null, dimensions, nonEmptyUpdateValues);
  }

  private PublishSchema parsePublishSchema(String schemaJson) {
    PublishSchema out = new PublishSchema();
    try {
      JsonNode root = objectMapper.readTree(schemaJson == null ? "{}" : schemaJson);
      collectColumns(root.get("dimension_columns"), "dimension", out);
      collectColumns(root.get("indicator_columns"), "indicator", out);
      collectColumns(root.get("columns"), null, out);
    } catch (Exception ex) {
      throw new IllegalArgumentException("Invalid wide table schema_json", ex);
    }
    if (out.dimensionColumns.isEmpty()) {
      throw new IllegalArgumentException("No dimension columns configured for publish");
    }
    if (out.indicatorColumns.isEmpty()) {
      throw new IllegalArgumentException("No indicator columns configured for publish");
    }
    return out;
  }

  private void collectColumns(JsonNode nodes, String forcedCategory, PublishSchema out) {
    if (nodes == null || !nodes.isArray()) {
      return;
    }
    for (JsonNode node : nodes) {
      String column = firstText(node, "key", "name", "id");
      if (column == null || !SAFE_IDENTIFIER.matcher(column).matches()) {
        continue;
      }
      String category = forcedCategory != null ? forcedCategory : firstText(node, "role", "category");
      if ("dimension".equalsIgnoreCase(category)) {
        addOnce(out.dimensionColumns, column);
        if (node.path("is_business_date").asBoolean(false) || node.path("isBusinessDate").asBoolean(false)) {
          out.businessDateColumns.add(column);
        }
      } else if ("indicator".equalsIgnoreCase(category)) {
        addOnce(out.indicatorColumns, column);
      }
    }
  }

  private void validateTargetTable(String schema, String tableName, PublishSchema publishSchema) {
    Set<String> targetColumns = loadTargetColumns(schema, tableName);
    if (targetColumns.isEmpty()) {
      throw new IllegalArgumentException("Target table not found: " + schema + "." + tableName);
    }
    publishSchema.hasIdColumn = targetColumns.contains("ID");
    List<String> missing = new ArrayList<String>();
    for (String column : publishSchema.dimensionColumns) {
      if (!targetColumns.contains(column.toUpperCase(Locale.ROOT))) {
        missing.add(column);
      }
    }
    for (String column : publishSchema.indicatorColumns) {
      if (!targetColumns.contains(column.toUpperCase(Locale.ROOT))) {
        missing.add(column);
      }
    }
    if (!missing.isEmpty()) {
      throw new IllegalArgumentException("Target table missing columns: " + String.join(", ", missing));
    }
  }

  private Set<String> loadTargetColumns(String schema, String tableName) {
    String sql =
        "select column_name from information_schema.columns where table_schema = ? and table_name = ?";
    List<String> columns = jdbcTemplate.query(
        sql,
        new Object[] {schema, tableName},
        (rs, rowNum) -> rs.getString("column_name"));
    Set<String> out = new LinkedHashSet<String>();
    for (String column : columns) {
      if (column != null) {
        out.add(column.toUpperCase(Locale.ROOT));
      }
    }
    return out;
  }

  private List<WideTableRowRecord> filterRows(List<WideTableRowRecord> rows, List<Integer> rowIds) {
    if (rows == null || rowIds == null) {
      return rows;
    }
    if (rowIds.isEmpty()) {
      return new ArrayList<WideTableRowRecord>();
    }
    Set<Integer> selected = new LinkedHashSet<Integer>();
    for (Integer rowId : rowIds) {
      if (rowId != null) {
        selected.add(rowId);
      }
    }
    if (selected.isEmpty()) {
      return rows;
    }
    List<WideTableRowRecord> out = new ArrayList<WideTableRowRecord>();
    for (WideTableRowRecord row : rows) {
      if (row.getRowId() != null && selected.contains(row.getRowId())) {
        out.add(row);
      }
    }
    return out;
  }

  private int countTargetRows(String schema, String tableName, Map<String, Object> dimensions) {
    SqlAndArgs where = buildWhere(dimensions);
    String sql = "select count(*) from " + qualifiedName(schema, tableName) + " where " + where.sql;
    Integer count = jdbcTemplate.queryForObject(sql, where.args.toArray(), Integer.class);
    return count == null ? 0 : count.intValue();
  }

  private void insertTargetRow(String schema, String tableName, Map<String, Object> values) {
    StringBuilder columns = new StringBuilder();
    StringBuilder placeholders = new StringBuilder();
    List<Object> args = new ArrayList<Object>();
    int index = 0;
    for (Map.Entry<String, Object> entry : values.entrySet()) {
      if (index++ > 0) {
        columns.append(", ");
        placeholders.append(", ");
      }
      columns.append(quote(entry.getKey()));
      placeholders.append("?");
      args.add(entry.getValue());
    }
    String sql = "insert into " + qualifiedName(schema, tableName) + " (" + columns + ") values (" + placeholders + ")";
    jdbcTemplate.update(sql, args.toArray());
  }

  private Long nextTargetId(String schema, String tableName) {
    String sql = "select coalesce(max(`ID`), 0) + 1 from " + qualifiedName(schema, tableName);
    Number next = jdbcTemplate.queryForObject(sql, Number.class);
    return next == null ? 1L : Long.valueOf(next.longValue());
  }

  private void updateTargetRow(
      String schema,
      String tableName,
      Map<String, Object> values,
      Map<String, Object> dimensions) {
    StringBuilder set = new StringBuilder();
    List<Object> args = new ArrayList<Object>();
    int index = 0;
    for (Map.Entry<String, Object> entry : values.entrySet()) {
      if (index++ > 0) {
        set.append(", ");
      }
      set.append(quote(entry.getKey())).append(" = ?");
      args.add(entry.getValue());
    }
    SqlAndArgs where = buildWhere(dimensions);
    args.addAll(where.args);
    String sql = "update " + qualifiedName(schema, tableName) + " set " + set + " where " + where.sql;
    jdbcTemplate.update(sql, args.toArray());
  }

  private Map<String, Object> findLatestTargetValues(
      String schema,
      String tableName,
      List<String> indicatorColumns,
      Map<String, Object> dimensions,
      boolean hasIdColumn) {
    if (indicatorColumns == null || indicatorColumns.isEmpty()) {
      return new LinkedHashMap<String, Object>();
    }
    StringBuilder select = new StringBuilder();
    for (int i = 0; i < indicatorColumns.size(); i++) {
      if (i > 0) {
        select.append(", ");
      }
      select.append(quote(indicatorColumns.get(i)));
    }
    SqlAndArgs where = buildWhere(dimensions);
    String sql = "select " + select + " from " + qualifiedName(schema, tableName) + " where " + where.sql
        + (hasIdColumn ? " order by `ID` desc" : "")
        + " limit 1";
    List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, where.args.toArray());
    if (rows == null || rows.isEmpty()) {
      return null;
    }
    Map<String, Object> raw = rows.get(0);
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    for (String column : indicatorColumns) {
      Object value = raw.get(column);
      if (value == null) {
        value = raw.get(column.toUpperCase(Locale.ROOT));
      }
      if (value == null) {
        value = raw.get(column.toLowerCase(Locale.ROOT));
      }
      out.put(column, value);
    }
    return out;
  }

  private SqlAndArgs buildWhere(Map<String, Object> dimensions) {
    StringBuilder where = new StringBuilder();
    List<Object> args = new ArrayList<Object>();
    int index = 0;
    for (Map.Entry<String, Object> entry : dimensions.entrySet()) {
      if (index++ > 0) {
        where.append(" and ");
      }
      where.append(quote(entry.getKey())).append(" = ?");
      args.add(entry.getValue());
    }
    return new SqlAndArgs(where.toString(), args);
  }

  private void insertJob(
      String jobId,
      WideTableRecord wideTable,
      String taskGroupId,
      String schema,
      String tableName,
      LocalDateTime now) {
    try {
      jdbcTemplate.update(
          "insert into target_publish_jobs "
              + "(id, requirement_id, wide_table_id, task_group_id, target_schema, target_table, status) "
              + "values (?, ?, ?, ?, ?, ?, 'running')",
          jobId,
          wideTable.getRequirementId(),
          wideTable.getId(),
          taskGroupId,
          schema,
          tableName);
    } catch (Exception ignored) {
      // Publishing must not depend on optional audit tables being migrated first.
    }
  }

  private void updateJob(String jobId, TargetPublishOutcome outcome, String errorMsg, LocalDateTime publishedAt) {
    try {
      jdbcTemplate.update(
          "update target_publish_jobs set status = ?, total_rows = ?, inserted_rows = ?, updated_rows = ?, "
              + "skipped_rows = ?, failed_rows = ?, error_msg = ?, published_at = ? where id = ?",
          outcome.getStatus(),
          outcome.getTotalRows(),
          outcome.getInsertedRows(),
          outcome.getUpdatedRows(),
          outcome.getSkippedRows(),
          outcome.getFailedRows(),
          errorMsg,
          publishedAt,
          jobId);
    } catch (Exception ignored) {
      // Optional audit table failure should not roll back target table publishing.
    }
  }

  private void insertRowLog(
      String jobId,
      WideTableRecord wideTable,
      WideTableRowRecord row,
      String action,
      String status,
      String errorMsg,
      Map<String, Object> dimensions,
      Map<String, Object> targetValues) {
    String id = "TPRL-" + UUID.randomUUID().toString().replace("-", "").substring(0, 24);
    try {
      jdbcTemplate.update(
          "insert into target_publish_row_logs "
              + "(id, job_id, requirement_id, wide_table_id, row_id, action, status, error_msg, dimension_values_json, target_values_json) "
              + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          id,
          jobId,
          wideTable.getRequirementId(),
          wideTable.getId(),
          row.getRowId(),
          action,
          status,
          errorMsg,
          writeJson(dimensions),
          writeJson(targetValues));
    } catch (Exception ignored) {
      // Optional audit table failure should not roll back target table publishing.
    }
  }

  private Map<String, Object> readMap(String json) {
    if (json == null || json.trim().isEmpty()) {
      return new LinkedHashMap<String, Object>();
    }
    try {
      return objectMapper.readValue(json, MAP_REF);
    } catch (Exception ex) {
      return new LinkedHashMap<String, Object>();
    }
  }

  @SuppressWarnings("unchecked")
  private Object extractCellValue(Object cell) {
    if (cell instanceof Map) {
      return ((Map<String, Object>) cell).get("value");
    }
    return cell;
  }

  private Object normalizeValue(Object value) {
    if (value == null) {
      return null;
    }
    String text = String.valueOf(value).trim();
    if (text.isEmpty() || "-".equals(text) || "NULL".equalsIgnoreCase(text)) {
      return null;
    }
    return value;
  }

  private boolean isBusinessDateColumn(PublishSchema schema, String column) {
    return schema.businessDateColumns.contains(column)
        || "business_date".equalsIgnoreCase(column)
        || "biz_date".equalsIgnoreCase(column)
        || "enddate".equalsIgnoreCase(column);
  }

  private String firstText(JsonNode node, String... keys) {
    if (node == null) {
      return null;
    }
    for (String key : keys) {
      JsonNode value = node.get(key);
      if (value != null && value.isValueNode()) {
        String text = trimToNull(value.asText());
        if (text != null) {
          return text;
        }
      }
    }
    return null;
  }

  private void addOnce(List<String> values, String value) {
    if (!values.contains(value)) {
      values.add(value);
    }
  }

  private String requireSafeIdentifier(String value, String label) {
    String normalized = trimToNull(value);
    if (normalized == null || !SAFE_IDENTIFIER.matcher(normalized).matches()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + label);
    }
    return normalized;
  }

  private String qualifiedName(String schema, String tableName) {
    return quote(schema) + "." + quote(tableName);
  }

  private String quote(String identifier) {
    if (identifier == null || !SAFE_IDENTIFIER.matcher(identifier).matches()) {
      throw new IllegalArgumentException("Unsafe identifier: " + identifier);
    }
    return "`" + identifier + "`";
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      return "{}";
    }
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private boolean containsColumnIgnoreCase(Map<String, Object> values, String column) {
    for (String key : values.keySet()) {
      if (key != null && key.equalsIgnoreCase(column)) {
        return true;
      }
    }
    return false;
  }

  private String rootMessage(Throwable error) {
    Throwable cursor = error;
    while (cursor.getCause() != null) {
      cursor = cursor.getCause();
    }
    String message = cursor.getMessage();
    return message != null && !message.trim().isEmpty() ? message : error.getMessage();
  }

  private static class PublishSchema {
    private final List<String> dimensionColumns = new ArrayList<String>();
    private final List<String> indicatorColumns = new ArrayList<String>();
    private final Set<String> businessDateColumns = new LinkedHashSet<String>();
    private boolean hasIdColumn;
  }

  private static class SqlAndArgs {
    private final String sql;
    private final List<Object> args;

    private SqlAndArgs(String sql, List<Object> args) {
      this.sql = sql;
      this.args = args;
    }
  }

  public static class TargetPublishOutcome {
    private String jobId;
    private String requirementId;
    private String wideTableId;
    private String taskGroupId;
    private String targetSchema;
    private String targetTable;
    private String status;
    private String errorMsg;
    private int totalRows;
    private int insertedRows;
    private int updatedRows;
    private int skippedRows;
    private int failedRows;

    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }
    public String getRequirementId() { return requirementId; }
    public void setRequirementId(String requirementId) { this.requirementId = requirementId; }
    public String getWideTableId() { return wideTableId; }
    public void setWideTableId(String wideTableId) { this.wideTableId = wideTableId; }
    public String getTaskGroupId() { return taskGroupId; }
    public void setTaskGroupId(String taskGroupId) { this.taskGroupId = taskGroupId; }
    public String getTargetSchema() { return targetSchema; }
    public void setTargetSchema(String targetSchema) { this.targetSchema = targetSchema; }
    public String getTargetTable() { return targetTable; }
    public void setTargetTable(String targetTable) { this.targetTable = targetTable; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getErrorMsg() { return errorMsg; }
    public void setErrorMsg(String errorMsg) { this.errorMsg = errorMsg; }
    public int getTotalRows() { return totalRows; }
    public void setTotalRows(int totalRows) { this.totalRows = totalRows; }
    public int getInsertedRows() { return insertedRows; }
    public void setInsertedRows(int insertedRows) { this.insertedRows = insertedRows; }
    public int getUpdatedRows() { return updatedRows; }
    public void setUpdatedRows(int updatedRows) { this.updatedRows = updatedRows; }
    public int getSkippedRows() { return skippedRows; }
    public void setSkippedRows(int skippedRows) { this.skippedRows = skippedRows; }
    public int getFailedRows() { return failedRows; }
    public void setFailedRows(int failedRows) { this.failedRows = failedRows; }
  }

  public static class TargetComparisonOutcome {
    private String requirementId;
    private String wideTableId;
    private String targetSchema;
    private String targetTable;
    private String status;
    private int totalRows;
    private int matchedRows;
    private int missingRows;
    private int failedRows;
    private final List<TargetComparisonRow> rows = new ArrayList<TargetComparisonRow>();

    public String getRequirementId() { return requirementId; }
    public void setRequirementId(String requirementId) { this.requirementId = requirementId; }
    public String getWideTableId() { return wideTableId; }
    public void setWideTableId(String wideTableId) { this.wideTableId = wideTableId; }
    public String getTargetSchema() { return targetSchema; }
    public void setTargetSchema(String targetSchema) { this.targetSchema = targetSchema; }
    public String getTargetTable() { return targetTable; }
    public void setTargetTable(String targetTable) { this.targetTable = targetTable; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getTotalRows() { return totalRows; }
    public void setTotalRows(int totalRows) { this.totalRows = totalRows; }
    public int getMatchedRows() { return matchedRows; }
    public void setMatchedRows(int matchedRows) { this.matchedRows = matchedRows; }
    public int getMissingRows() { return missingRows; }
    public void setMissingRows(int missingRows) { this.missingRows = missingRows; }
    public int getFailedRows() { return failedRows; }
    public void setFailedRows(int failedRows) { this.failedRows = failedRows; }
    public List<TargetComparisonRow> getRows() { return rows; }
  }

  public static class TargetComparisonRow {
    private Integer rowId;
    private String status;
    private String message;
    private Map<String, Object> dimensionValues = new LinkedHashMap<String, Object>();
    private Map<String, Object> previousValues = new LinkedHashMap<String, Object>();

    public Integer getRowId() { return rowId; }
    public void setRowId(Integer rowId) { this.rowId = rowId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Map<String, Object> getDimensionValues() { return dimensionValues; }
    public void setDimensionValues(Map<String, Object> dimensionValues) { this.dimensionValues = dimensionValues; }
    public Map<String, Object> getPreviousValues() { return previousValues; }
    public void setPreviousValues(Map<String, Object> previousValues) { this.previousValues = previousValues; }
  }
}
