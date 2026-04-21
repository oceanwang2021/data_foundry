package com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.record.FetchTaskRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface FetchTaskMapper {

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, task_group_id, batch_id, row_id, "
          + "indicator_group_id, indicator_group_name, name, schema_version, execution_mode, "
          + "indicator_keys_json, dimension_values_json, business_date, status, can_rerun, "
          + "invalidated_reason, owner, confidence, plan_version, row_binding_key, created_at, updated_at "
          + "from fetch_tasks "
          + "where requirement_id = #{requirementId} "
          + "order by sort_order asc")
  List<FetchTaskRecord> listByRequirement(@Param("requirementId") String requirementId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, task_group_id, batch_id, row_id, "
          + "indicator_group_id, indicator_group_name, name, schema_version, execution_mode, "
          + "indicator_keys_json, dimension_values_json, business_date, status, can_rerun, "
          + "invalidated_reason, owner, confidence, plan_version, row_binding_key, created_at, updated_at "
          + "from fetch_tasks "
          + "where task_group_id = #{taskGroupId} "
          + "order by sort_order asc")
  List<FetchTaskRecord> listByTaskGroup(@Param("taskGroupId") String taskGroupId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, task_group_id, batch_id, row_id, "
          + "indicator_group_id, indicator_group_name, name, schema_version, execution_mode, "
          + "indicator_keys_json, dimension_values_json, business_date, status, can_rerun, "
          + "invalidated_reason, owner, confidence, plan_version, row_binding_key, created_at, updated_at "
          + "from fetch_tasks "
          + "where id = #{id} "
          + "limit 1")
  FetchTaskRecord getById(@Param("id") String id);

  @Select("select count(1) from fetch_tasks where task_group_id = #{taskGroupId}")
  int countByTaskGroup(@Param("taskGroupId") String taskGroupId);

  @Insert({
      "<script>",
      "insert into fetch_tasks (",
      "  id, sort_order, requirement_id, wide_table_id, task_group_id, batch_id, row_id,",
      "  indicator_group_id, indicator_group_name, name, schema_version, execution_mode,",
      "  indicator_keys_json, dimension_values_json, business_date, status, can_rerun,",
      "  invalidated_reason, owner, confidence, plan_version, row_binding_key",
      ") values ",
      "  <foreach collection='records' item='r' separator=','>",
      "    (#{r.id}, #{r.sortOrder}, #{r.requirementId}, #{r.wideTableId}, #{r.taskGroupId}, #{r.batchId}, #{r.rowId},",
      "     #{r.indicatorGroupId}, #{r.indicatorGroupName}, #{r.name}, #{r.schemaVersion}, #{r.executionMode},",
      "     #{r.indicatorKeysJson}, #{r.dimensionValuesJson}, #{r.businessDate}, #{r.status}, #{r.canRerun},",
      "     #{r.invalidatedReason}, #{r.owner}, #{r.confidence}, #{r.planVersion}, #{r.rowBindingKey})",
      "  </foreach>",
      "on duplicate key update ",
      "  status = values(status),",
      "  confidence = values(confidence),",
      "  can_rerun = values(can_rerun),",
      "  invalidated_reason = values(invalidated_reason),",
      "  updated_at = current_timestamp",
      "</script>",
  })
  int upsertBatch(@Param("records") List<FetchTaskRecord> records);

  @Update("update fetch_tasks set status = #{status}, updated_at = current_timestamp where id = #{id}")
  int updateStatus(@Param("id") String id, @Param("status") String status);
}
