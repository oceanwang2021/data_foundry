package com.huatai.datafoundry.backend.targettable.application.query.service;

import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableColumnReadDto;
import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableReadDto;
import java.sql.Connection;
import java.sql.ResultSetMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class TargetTableQueryService {
  private static final Pattern SAFE_TABLE_NAME = Pattern.compile("^[A-Za-z0-9_]+$");
  private static final int DEFAULT_QUERY_LIMIT = 500;
  private static final int MAX_QUERY_LIMIT = 1000;

  private final DataSource dataSource;
  private final String targetSchema;

  public TargetTableQueryService(
      DataSource dataSource,
      @Value("${datafoundry.target-tables.schema:target_tables}") String targetSchema) {
    this.dataSource = dataSource;
    this.targetSchema = targetSchema;
  }

  public List<TargetTableReadDto> listTables(String keyword) {
    String kw = keyword == null ? "" : keyword.trim();
    boolean hasKw = !kw.isEmpty();

    String sql =
        "SELECT table_name, table_comment, create_time, update_time "
            + "FROM information_schema.tables "
            + "WHERE table_schema = ? AND table_type = 'BASE TABLE' "
            + (hasKw ? "AND (table_name LIKE ? OR table_comment LIKE ?) " : "")
            + "ORDER BY table_name";

    List<TargetTableReadDto> result = new ArrayList<>();
    try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
      int idx = 1;
      ps.setString(idx++, targetSchema);
      if (hasKw) {
        String like = "%" + kw + "%";
        ps.setString(idx++, like);
        ps.setString(idx++, like);
      }
      try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
          TargetTableReadDto dto = new TargetTableReadDto();
          dto.setTableName(rs.getString("table_name"));
          dto.setTableComment(rs.getString("table_comment"));
          dto.setCreateTime(rs.getObject("create_time"));
          dto.setUpdateTime(rs.getObject("update_time"));
          result.add(dto);
        }
      }
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to list target tables from schema: " + targetSchema, ex);
    }
    return result;
  }

  public List<TargetTableColumnReadDto> listColumns(String tableName) {
    if (tableName == null || !SAFE_TABLE_NAME.matcher(tableName).matches()) {
      return Collections.emptyList();
    }

    String sql =
        "SELECT column_name, data_type, column_type, is_nullable, column_comment, ordinal_position "
            + "FROM information_schema.columns "
            + "WHERE table_schema = ? AND table_name = ? "
            + "ORDER BY ordinal_position";

    List<TargetTableColumnReadDto> result = new ArrayList<>();
    try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
      ps.setString(1, targetSchema);
      ps.setString(2, tableName);
      try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
          TargetTableColumnReadDto dto = new TargetTableColumnReadDto();
          dto.setColumnName(rs.getString("column_name"));
          dto.setDataType(rs.getString("data_type"));
          dto.setColumnType(rs.getString("column_type"));
          dto.setIsNullable(rs.getString("is_nullable"));
          dto.setColumnComment(rs.getString("column_comment"));
          dto.setOrdinalPosition(rs.getInt("ordinal_position"));
          result.add(dto);
        }
      }
    } catch (Exception ex) {
      throw new IllegalStateException(
          "Failed to list columns for target table: " + targetSchema + "." + tableName, ex);
    }
    return result;
  }

  public Map<String, Object> previewSelectSql(String sqlText, Integer requestedLimit) {
    String sql = normalizeSelectSql(sqlText);
    int limit = normalizeLimit(requestedLimit);
    String previewSql = "SELECT * FROM (" + sql + ") parameter_rows_preview LIMIT ?";

    List<String> headers = new ArrayList<String>();
    List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
    try (Connection conn = dataSource.getConnection()) {
      String originalCatalog = conn.getCatalog();
      boolean originalReadOnly = conn.isReadOnly();
      conn.setReadOnly(true);
      if (targetSchema != null && !targetSchema.trim().isEmpty()) {
        conn.setCatalog(targetSchema);
      }
      try {
        try (PreparedStatement ps = conn.prepareStatement(previewSql)) {
          ps.setInt(1, limit);
          try (ResultSet rs = ps.executeQuery()) {
            ResultSetMetaData metaData = rs.getMetaData();
            int columnCount = metaData.getColumnCount();
            for (int i = 1; i <= columnCount; i++) {
              headers.add(metaData.getColumnLabel(i));
            }
            while (rs.next()) {
              Map<String, Object> row = new LinkedHashMap<String, Object>();
              for (int i = 1; i <= columnCount; i++) {
                row.put(headers.get(i - 1), rs.getObject(i));
              }
              rows.add(row);
            }
          }
        }
      } finally {
        conn.setCatalog(originalCatalog);
        conn.setReadOnly(originalReadOnly);
      }
    } catch (IllegalArgumentException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to preview parameter rows SQL", ex);
    }

    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("headers", headers);
    out.put("rows", rows);
    out.put("row_count", rows.size());
    out.put("limit", limit);
    return out;
  }

  private static String normalizeSelectSql(String sqlText) {
    String sql = sqlText == null ? "" : sqlText.trim();
    if (sql.endsWith(";")) {
      sql = sql.substring(0, sql.length() - 1).trim();
    }
    if (sql.isEmpty()) {
      throw new IllegalArgumentException("SQL cannot be empty");
    }
    String lower = sql.toLowerCase(Locale.ROOT);
    if (!lower.startsWith("select ")) {
      throw new IllegalArgumentException("Only SELECT SQL is allowed");
    }
    if (sql.indexOf(';') >= 0) {
      throw new IllegalArgumentException("Only a single SELECT statement is allowed");
    }
    if (lower.contains(" for update")) {
      throw new IllegalArgumentException("SELECT ... FOR UPDATE is not allowed");
    }
    return sql;
  }

  private static int normalizeLimit(Integer requestedLimit) {
    if (requestedLimit == null || requestedLimit.intValue() <= 0) {
      return DEFAULT_QUERY_LIMIT;
    }
    return Math.min(requestedLimit.intValue(), MAX_QUERY_LIMIT);
  }
}
