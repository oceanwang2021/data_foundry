package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface WideTableRowMapper {
  @Select(
      "select wide_table_id, row_id, sort_order, requirement_id, schema_version, plan_version, row_status, "
          + "dimension_values_json, parameter_values_json, business_date, row_binding_key, indicator_values_json, system_values_json "
          + "from wide_table_rows where wide_table_id = #{wideTableId} order by sort_order asc, row_id asc")
  List<WideTableRowRecord> listByWideTableId(@Param("wideTableId") String wideTableId);

  @Delete("delete from wide_table_rows where wide_table_id = #{wideTableId} and plan_version != #{planVersion}")
  int deleteByWideTableIdNotPlanVersion(
      @Param("wideTableId") String wideTableId,
      @Param("planVersion") Integer planVersion);

  @Delete("delete from wide_table_rows where wide_table_id = #{wideTableId}")
  int deleteByWideTableId(@Param("wideTableId") String wideTableId);

  @Insert({
      "<script>",
      "insert into wide_table_rows (",
      "  wide_table_id, row_id, sort_order, requirement_id, schema_version, plan_version, row_status, ",
      "  dimension_values_json, parameter_values_json, business_date, row_binding_key",
      ") values",
      "<foreach collection='rows' item='r' separator=','>",
      "  (",
      "    #{r.wideTableId}, #{r.rowId}, #{r.sortOrder}, #{r.requirementId}, #{r.schemaVersion}, #{r.planVersion}, #{r.rowStatus},",
      "    #{r.dimensionValuesJson}, #{r.parameterValuesJson}, #{r.businessDate}, #{r.rowBindingKey}",
      "  )",
      "</foreach>",
      "on duplicate key update",
      "  sort_order = values(sort_order),",
      "  requirement_id = values(requirement_id),",
      "  schema_version = values(schema_version),",
      "  plan_version = values(plan_version),",
      "  row_status = values(row_status),",
      "  dimension_values_json = values(dimension_values_json),",
      "  parameter_values_json = values(parameter_values_json),",
      "  business_date = values(business_date),",
      "  row_binding_key = values(row_binding_key)",
      "</script>",
  })
  int upsertRows(@Param("rows") List<WideTableRowRecord> rows);

  @Update({
      "<script>",
      "update wide_table_rows",
      "<set>",
      "  <if test='rowStatus != null'>row_status = #{rowStatus},</if>",
      "  <if test='indicatorValuesJson != null'>indicator_values_json = #{indicatorValuesJson},</if>",
      "  <if test='systemValuesJson != null'>system_values_json = #{systemValuesJson},</if>",
      "</set>",
      "where wide_table_id = #{wideTableId} and row_id = #{rowId}",
      "</script>",
  })
  int updateRowValues(WideTableRowRecord patch);
}
