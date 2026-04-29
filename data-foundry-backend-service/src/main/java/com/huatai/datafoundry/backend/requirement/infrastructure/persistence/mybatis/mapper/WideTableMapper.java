package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface WideTableMapper {

  @Insert("insert into wide_tables (id, sort_order, requirement_id, title, description, table_name, schema_version, "
      + "schema_json, scope_json, indicator_groups_json, schedule_rules_json, semantic_time_axis, "
      + "collection_coverage_mode, status, record_count) "
      + "values (#{id}, #{sortOrder}, #{requirementId}, #{title}, #{description}, #{tableName}, #{schemaVersion}, "
      + "#{schemaJson}, #{scopeJson}, #{indicatorGroupsJson}, #{scheduleRulesJson}, #{semanticTimeAxis}, "
      + "#{collectionCoverageMode}, #{status}, #{recordCount})")
  int insert(WideTableRecord record);

  @Select(
      "select "
          + "id, sort_order, requirement_id, title, description, table_name, schema_version, "
          + "schema_json, scope_json, indicator_groups_json, schedule_rules_json, semantic_time_axis, "
          + "collection_coverage_mode, status, record_count, created_at, updated_at "
          + "from wide_tables "
          + "where requirement_id = #{requirementId} "
          + "order by sort_order asc "
          + "limit 1")
  WideTableRecord getPrimaryByRequirement(@Param("requirementId") String requirementId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, title, description, table_name, schema_version, "
          + "schema_json, scope_json, indicator_groups_json, schedule_rules_json, semantic_time_axis, "
          + "collection_coverage_mode, status, record_count, created_at, updated_at "
          + "from wide_tables "
          + "where id = #{wideTableId} and requirement_id = #{requirementId} "
          + "limit 1")
  WideTableRecord getByIdForRequirement(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId);

  @Update({
      "<script>",
      "update wide_tables",
      "<set>",
      "  <if test='title != null'>title = #{title},</if>",
      "  <if test='description != null'>description = #{description},</if>",
      "  <if test='tableName != null'>table_name = #{tableName},</if>",
      "  <if test='schemaVersion != null'>schema_version = #{schemaVersion},</if>",
      "  <if test='schemaJson != null'>schema_json = #{schemaJson},</if>",
      "  <if test='scopeJson != null'>scope_json = #{scopeJson},</if>",
      "  <if test='indicatorGroupsJson != null'>indicator_groups_json = #{indicatorGroupsJson},</if>",
      "  <if test='scheduleRulesJson != null'>schedule_rules_json = #{scheduleRulesJson},</if>",
      "  <if test='semanticTimeAxis != null'>semantic_time_axis = #{semanticTimeAxis},</if>",
      "  <if test='collectionCoverageMode != null'>collection_coverage_mode = #{collectionCoverageMode},</if>",
      "  <if test='status != null'>status = #{status},</if>",
      "  <if test='recordCount != null'>record_count = #{recordCount},</if>",
      "</set>",
      "where id = #{id} and requirement_id = #{requirementId}",
      "</script>",
  })
  int updateByIdAndRequirement(WideTableRecord record);

  @Select({
      "<script>",
      "select ",
      "  id, sort_order, requirement_id, title, description, table_name, schema_version, ",
      "  schema_json, scope_json, indicator_groups_json, schedule_rules_json, semantic_time_axis, ",
      "  collection_coverage_mode, status, record_count, created_at, updated_at ",
      "from wide_tables ",
      "where sort_order = 0 ",
      "  and requirement_id in ",
      "  <foreach collection='requirementIds' item='rid' open='(' separator=',' close=')'>",
      "    #{rid}",
      "  </foreach>",
      "</script>",
  })
  List<WideTableRecord> listPrimaryByRequirementIds(@Param("requirementIds") List<String> requirementIds);
}
