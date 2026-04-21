package com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.record.TaskGroupRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface TaskGroupMapper {

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, "
          + "schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at "
          + "from task_groups "
          + "where requirement_id = #{requirementId} "
          + "order by sort_order asc")
  List<TaskGroupRecord> listByRequirement(@Param("requirementId") String requirementId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, "
          + "schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at "
          + "from task_groups "
          + "where requirement_id = #{requirementId} and wide_table_id = #{wideTableId} "
          + "order by sort_order asc")
  List<TaskGroupRecord> listByRequirementAndWideTable(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, "
          + "schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at "
          + "from task_groups where id = #{id} limit 1")
  TaskGroupRecord getById(@Param("id") String id);

  @Select({
      "<script>",
      "select ",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, ",
      "  schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, ",
      "  partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at ",
      "from task_groups ",
      "where id in ",
      "  <foreach collection='ids' item='id' open='(' separator=',' close=')'>",
      "    #{id}",
      "  </foreach>",
      "</script>",
  })
  List<TaskGroupRecord> listByIds(@Param("ids") List<String> ids);

  @Select("select count(1) from task_groups where requirement_id = #{requirementId}")
  int countByRequirement(@Param("requirementId") String requirementId);

  @Insert({
      "insert into task_groups (",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status,",
      "  schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key,",
      "  partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by",
      ") values (",
      "  #{id}, #{sortOrder}, #{requirementId}, #{wideTableId}, #{batchId}, #{businessDate}, #{sourceType}, #{status},",
      "  #{scheduleRuleId}, #{backfillRequestId}, #{planVersion}, #{groupKind}, #{partitionType}, #{partitionKey},",
      "  #{partitionLabel}, #{totalTasks}, #{completedTasks}, #{failedTasks}, #{triggeredBy}",
      ") on duplicate key update ",
      "  sort_order = values(sort_order),",
      "  batch_id = values(batch_id),",
      "  business_date = values(business_date),",
      "  source_type = values(source_type),",
      "  status = values(status),",
      "  schedule_rule_id = values(schedule_rule_id),",
      "  backfill_request_id = values(backfill_request_id),",
      "  plan_version = values(plan_version),",
      "  group_kind = values(group_kind),",
      "  partition_type = values(partition_type),",
      "  partition_key = values(partition_key),",
      "  partition_label = values(partition_label),",
      "  total_tasks = values(total_tasks),",
      "  completed_tasks = values(completed_tasks),",
      "  failed_tasks = values(failed_tasks),",
      "  triggered_by = values(triggered_by),",
      "  updated_at = current_timestamp",
  })
  int upsert(TaskGroupRecord record);

  @Insert({
      "<script>",
      "insert into task_groups (",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status,",
      "  schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key,",
      "  partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by",
      ") values ",
      "  <foreach collection='records' item='r' separator=','>",
      "    (#{r.id}, #{r.sortOrder}, #{r.requirementId}, #{r.wideTableId}, #{r.batchId}, #{r.businessDate}, #{r.sourceType}, #{r.status},",
      "     #{r.scheduleRuleId}, #{r.backfillRequestId}, #{r.planVersion}, #{r.groupKind}, #{r.partitionType}, #{r.partitionKey},",
      "     #{r.partitionLabel}, #{r.totalTasks}, #{r.completedTasks}, #{r.failedTasks}, #{r.triggeredBy})",
      "  </foreach>",
      "on duplicate key update ",
      "  sort_order = values(sort_order),",
      "  batch_id = values(batch_id),",
      "  business_date = values(business_date),",
      "  source_type = values(source_type),",
      "  status = values(status),",
      "  schedule_rule_id = values(schedule_rule_id),",
      "  backfill_request_id = values(backfill_request_id),",
      "  plan_version = values(plan_version),",
      "  group_kind = values(group_kind),",
      "  partition_type = values(partition_type),",
      "  partition_key = values(partition_key),",
      "  partition_label = values(partition_label),",
      "  total_tasks = values(total_tasks),",
      "  completed_tasks = values(completed_tasks),",
      "  failed_tasks = values(failed_tasks),",
      "  triggered_by = values(triggered_by),",
      "  updated_at = current_timestamp",
      "</script>",
  })
  int upsertBatch(@Param("records") List<TaskGroupRecord> records);

  @Update("update task_groups set status = #{status}, updated_at = current_timestamp where id = #{id}")
  int updateStatus(@Param("id") String id, @Param("status") String status);

  @Update({
      "<script>",
      "update task_groups",
      "set status = #{status}, updated_at = current_timestamp",
      "where id in ",
      "  <foreach collection='ids' item='id' open='(' separator=',' close=')'>",
      "    #{id}",
      "  </foreach>",
      "</script>",
  })
  int updateStatusByIds(@Param("ids") List<String> ids, @Param("status") String status);
}
