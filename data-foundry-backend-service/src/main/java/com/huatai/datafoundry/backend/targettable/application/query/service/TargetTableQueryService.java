package com.huatai.datafoundry.backend.targettable.application.query.service;

import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableColumnReadDto;
import com.huatai.datafoundry.backend.targettable.application.query.dto.TargetTableReadDto;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class TargetTableQueryService {
  private static final Pattern SAFE_TABLE_NAME = Pattern.compile("^[A-Za-z0-9_]+$");

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
}
