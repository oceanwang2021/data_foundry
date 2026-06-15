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
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status, "
          + "schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks, "
          + "cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at, created_at, updated_at "
          + "from task_groups "
          + "where requirement_id = #{requirementId} "
          + "order by sort_order asc")
  List<TaskGroupRecord> listByRequirement(@Param("requirementId") String requirementId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status, "
          + "schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks, "
          + "cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at, created_at, updated_at "
          + "from task_groups "
          + "order by requirement_id asc, sort_order asc")
  List<TaskGroupRecord> listAll();

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status, "
          + "schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks, "
          + "cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at, created_at, updated_at "
          + "from task_groups "
          + "where requirement_id = #{requirementId} and wide_table_id = #{wideTableId} "
          + "order by sort_order asc")
  List<TaskGroupRecord> listByRequirementAndWideTable(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status, "
          + "schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks, "
          + "cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at, created_at, updated_at "
          + "from task_groups where id = #{id} limit 1")
  TaskGroupRecord getById(@Param("id") String id);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status, "
          + "schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks, "
          + "cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at, created_at, updated_at "
          + "from task_groups where schedule_rule_id = #{scheduleRuleId} and business_date = #{businessDate} "
          + "and indicator_group_id = #{indicatorGroupId} limit 1")
  TaskGroupRecord getByScheduleRulePeriodAndIndicatorGroup(
      @Param("scheduleRuleId") String scheduleRuleId,
      @Param("businessDate") String businessDate,
      @Param("indicatorGroupId") String indicatorGroupId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status, "
          + "schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks, "
          + "cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at, created_at, updated_at "
          + "from task_groups where schedule_rule_id = #{scheduleRuleId} and status = 'pending' "
          + "order by scheduled_at asc, sort_order asc limit 1")
  TaskGroupRecord findNextPendingByScheduleRule(
      @Param("scheduleRuleId") String scheduleRuleId);

  @Select({
      "<script>",
      "select ",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status, ",
      "  schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, ",
      "  partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks, ",
      "  cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at, created_at, updated_at ",
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
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status,",
      "  schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key,",
      "  partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks,",
      "  cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at",
      ") values (",
      "  #{id}, #{sortOrder}, #{requirementId}, #{wideTableId}, #{batchId}, #{businessDate}, #{frequency}, #{sourceType}, #{status},",
      "  #{scheduleRuleId}, #{scheduledAt}, #{indicatorGroupId}, #{backfillRequestId}, #{planVersion}, #{groupKind}, #{partitionType}, #{partitionKey},",
      "  #{partitionLabel}, #{totalTasks}, #{pendingTasks}, #{runningTasks}, #{completedTasks}, #{failedTasks},",
      "  #{cancelledTasks}, #{invalidatedTasks}, #{triggeredBy}, #{lastAggregatedAt}",
      ") on duplicate key update ",
      "  sort_order = values(sort_order),",
      "  batch_id = values(batch_id),",
      "  business_date = values(business_date),",
      "  frequency = values(frequency),",
      "  source_type = values(source_type),",
      "  status = values(status),",
      "  schedule_rule_id = values(schedule_rule_id),",
      "  scheduled_at = values(scheduled_at),",
      "  indicator_group_id = values(indicator_group_id),",
      "  backfill_request_id = values(backfill_request_id),",
      "  plan_version = values(plan_version),",
      "  group_kind = values(group_kind),",
      "  partition_type = values(partition_type),",
      "  partition_key = values(partition_key),",
      "  partition_label = values(partition_label),",
      "  total_tasks = values(total_tasks),",
      "  pending_tasks = values(pending_tasks),",
      "  running_tasks = values(running_tasks),",
      "  completed_tasks = values(completed_tasks),",
      "  failed_tasks = values(failed_tasks),",
      "  cancelled_tasks = values(cancelled_tasks),",
      "  invalidated_tasks = values(invalidated_tasks),",
      "  triggered_by = values(triggered_by),",
      "  last_aggregated_at = coalesce(values(last_aggregated_at), last_aggregated_at),",
      "  updated_at = current_timestamp",
  })
  int upsert(TaskGroupRecord record);

  @Insert({
      "insert ignore into task_groups (",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status,",
      "  schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key,",
      "  partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks,",
      "  cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at",
      ") values (",
      "  #{id}, #{sortOrder}, #{requirementId}, #{wideTableId}, #{batchId}, #{businessDate}, #{frequency}, #{sourceType}, #{status},",
      "  #{scheduleRuleId}, #{scheduledAt}, #{indicatorGroupId}, #{backfillRequestId}, #{planVersion}, #{groupKind}, #{partitionType}, #{partitionKey},",
      "  #{partitionLabel}, #{totalTasks}, #{pendingTasks}, #{runningTasks}, #{completedTasks}, #{failedTasks},",
      "  #{cancelledTasks}, #{invalidatedTasks}, #{triggeredBy}, #{lastAggregatedAt}",
      ")"
  })
  int insertIfAbsent(TaskGroupRecord record);

  @Insert({
      "<script>",
      "insert into task_groups (",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, frequency, source_type, status,",
      "  schedule_rule_id, scheduled_at, indicator_group_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key,",
      "  partition_label, total_tasks, pending_tasks, running_tasks, completed_tasks, failed_tasks,",
      "  cancelled_tasks, invalidated_tasks, triggered_by, last_aggregated_at",
      ") values ",
      "  <foreach collection='records' item='r' separator=','>",
      "    (#{r.id}, #{r.sortOrder}, #{r.requirementId}, #{r.wideTableId}, #{r.batchId}, #{r.businessDate}, #{r.frequency}, #{r.sourceType}, #{r.status},",
      "     #{r.scheduleRuleId}, #{r.scheduledAt}, #{r.indicatorGroupId}, #{r.backfillRequestId}, #{r.planVersion}, #{r.groupKind}, #{r.partitionType}, #{r.partitionKey},",
      "     #{r.partitionLabel}, #{r.totalTasks}, #{r.pendingTasks}, #{r.runningTasks}, #{r.completedTasks}, #{r.failedTasks},",
      "     #{r.cancelledTasks}, #{r.invalidatedTasks}, #{r.triggeredBy}, #{r.lastAggregatedAt})",
      "  </foreach>",
      "on duplicate key update ",
      "  sort_order = values(sort_order),",
      "  batch_id = values(batch_id),",
      "  business_date = values(business_date),",
      "  frequency = values(frequency),",
      "  source_type = values(source_type),",
      "  status = values(status),",
      "  schedule_rule_id = values(schedule_rule_id),",
      "  scheduled_at = values(scheduled_at),",
      "  indicator_group_id = values(indicator_group_id),",
      "  backfill_request_id = values(backfill_request_id),",
      "  plan_version = values(plan_version),",
      "  group_kind = values(group_kind),",
      "  partition_type = values(partition_type),",
      "  partition_key = values(partition_key),",
      "  partition_label = values(partition_label),",
      "  total_tasks = values(total_tasks),",
      "  pending_tasks = values(pending_tasks),",
      "  running_tasks = values(running_tasks),",
      "  completed_tasks = values(completed_tasks),",
      "  failed_tasks = values(failed_tasks),",
      "  cancelled_tasks = values(cancelled_tasks),",
      "  invalidated_tasks = values(invalidated_tasks),",
      "  triggered_by = values(triggered_by),",
      "  last_aggregated_at = coalesce(values(last_aggregated_at), last_aggregated_at),",
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

  @Update(
      "update task_groups set schedule_rule_id = #{scheduleRuleId}, "
          + "scheduled_at = #{scheduledAt}, updated_at = current_timestamp "
          + "where id = #{id} and status = 'pending' and upper(source_type) = 'SCHEDULED'")
  int updatePendingSchedule(
      @Param("id") String id,
      @Param("scheduleRuleId") String scheduleRuleId,
      @Param("scheduledAt") java.time.LocalDateTime scheduledAt);
}
