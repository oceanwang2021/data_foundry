package com.huatai.datafoundry.backend.schedule.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ScheduleRuleMapper {
  @Select(
      "select id, requirement_id, wide_table_id, indicator_group_id, rule_name, rule_code, frequency, cron_expression, "
          + "business_date_mode, business_date_offset_days, trigger_time, enabled, xxl_job_group, xxl_executor_name, xxl_job_handler, "
          + "xxl_job_id, xxl_sync_status, xxl_sync_hash, xxl_last_sync_time, xxl_last_error_message, xxl_sync_retry_count, "
          + "last_trigger_time, last_success_time, last_trigger_status, next_trigger_time, "
          + "created_by, updated_by, created_at, updated_at from schedule_rules where id = #{id} limit 1")
  ScheduleRule getById(@Param("id") String id);

  @Select(
      "select id, requirement_id, wide_table_id, indicator_group_id, rule_name, rule_code, frequency, cron_expression, "
          + "business_date_mode, business_date_offset_days, trigger_time, enabled, xxl_job_group, xxl_executor_name, xxl_job_handler, "
          + "xxl_job_id, xxl_sync_status, xxl_sync_hash, xxl_last_sync_time, xxl_last_error_message, xxl_sync_retry_count, "
          + "last_trigger_time, last_success_time, last_trigger_status, next_trigger_time, "
          + "created_by, updated_by, created_at, updated_at from schedule_rules "
          + "where requirement_id = #{requirementId} and wide_table_id = #{wideTableId} "
          + "order by indicator_group_id asc")
  List<ScheduleRule> listByWideTable(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId);

  @Select(
      "select id, requirement_id, wide_table_id, indicator_group_id, rule_name, rule_code, frequency, cron_expression, "
          + "business_date_mode, business_date_offset_days, trigger_time, enabled, xxl_job_group, xxl_executor_name, xxl_job_handler, "
          + "xxl_job_id, xxl_sync_status, xxl_sync_hash, xxl_last_sync_time, xxl_last_error_message, xxl_sync_retry_count, "
          + "last_trigger_time, last_success_time, last_trigger_status, next_trigger_time, "
          + "created_by, updated_by, created_at, updated_at from schedule_rules "
          + "where xxl_sync_status in ('PENDING_SYNC', 'SYNC_FAILED') "
          + "order by updated_at asc limit #{limit}")
  List<ScheduleRule> listPendingXxlSync(@Param("limit") int limit);

  @Insert({
      "<script>",
      "insert into schedule_rules (",
      "id, requirement_id, wide_table_id, indicator_group_id, rule_name, rule_code, frequency,",
      "cron_expression, business_date_mode, business_date_offset_days, trigger_time,",
      "xxl_job_handler, enabled, xxl_sync_status, xxl_sync_hash, created_at, updated_at",
      ") values ",
      "<foreach collection='rules' item='r' separator=','>",
      "(#{r.id}, #{r.requirementId}, #{r.wideTableId}, #{r.indicatorGroupId}, #{r.ruleName},",
      " #{r.ruleCode}, #{r.frequency}, #{r.cronExpression}, #{r.businessDateMode},",
      " #{r.businessDateOffsetDays}, #{r.triggerTime}, #{r.xxlJobHandler}, #{r.enabled},",
      " 'PENDING_SYNC', #{r.xxlSyncHash},",
      " current_timestamp, current_timestamp)",
      "</foreach>",
      "on duplicate key update ",
      "rule_name=values(rule_name), rule_code=values(rule_code), frequency=values(frequency),",
      "cron_expression=values(cron_expression), business_date_mode=values(business_date_mode),",
      "business_date_offset_days=values(business_date_offset_days), trigger_time=values(trigger_time),",
      "xxl_job_handler=values(xxl_job_handler), enabled=values(enabled),",
      "xxl_sync_status=case ",
      "  when coalesce(xxl_sync_hash, '') != coalesce(values(xxl_sync_hash), '') then 'PENDING_SYNC' ",
      "  else xxl_sync_status end,",
      "xxl_last_error_message=case ",
      "  when coalesce(xxl_sync_hash, '') != coalesce(values(xxl_sync_hash), '') then null ",
      "  else xxl_last_error_message end,",
      "xxl_sync_retry_count=case ",
      "  when coalesce(xxl_sync_hash, '') != coalesce(values(xxl_sync_hash), '') then 0 ",
      "  else xxl_sync_retry_count end,",
      "xxl_sync_hash=values(xxl_sync_hash), updated_at=current_timestamp",
      "</script>"
  })
  int upsertBatch(@Param("rules") List<ScheduleRule> rules);

  @Update(
      "update schedule_rules set xxl_sync_status = case when enabled = 1 then 'PENDING_SYNC' else xxl_sync_status end, "
          + "xxl_sync_hash = case when enabled = 1 then repeat('0', 64) else xxl_sync_hash end, "
          + "enabled = 0, updated_at = current_timestamp "
          + "where requirement_id = #{requirementId} and wide_table_id = #{wideTableId}")
  int disableByWideTable(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId);

  @Update({
      "<script>",
      "update schedule_rules set ",
      "xxl_sync_status = case when enabled = 1 then 'PENDING_SYNC' else xxl_sync_status end, ",
      "xxl_sync_hash = case when enabled = 1 then repeat('0', 64) else xxl_sync_hash end, ",
      "enabled = 0, updated_at = current_timestamp ",
      "where requirement_id = #{requirementId} and wide_table_id = #{wideTableId} ",
      "<if test='indicatorGroupIds != null and indicatorGroupIds.size() > 0'>",
      "and indicator_group_id not in ",
      "<foreach collection='indicatorGroupIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
      "</if>",
      "</script>"
  })
  int disableMissingIndicatorGroups(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId,
      @Param("indicatorGroupIds") Collection<String> indicatorGroupIds);

  @Update(
      "update schedule_rules set last_trigger_time = #{triggerTime}, "
          + "last_success_time = coalesce(#{successTime}, last_success_time), "
          + "last_trigger_status = #{triggerStatus}, updated_at = current_timestamp where id = #{id}")
  int updateLastTrigger(
      @Param("id") String id,
      @Param("triggerTime") LocalDateTime triggerTime,
      @Param("successTime") LocalDateTime successTime,
      @Param("triggerStatus") String triggerStatus);

  @Update(
      "update schedule_rules set "
          + "last_success_time = coalesce(#{successTime}, last_success_time), "
          + "last_trigger_status = #{triggerStatus}, updated_at = current_timestamp where id = #{id}")
  int updateExecutionStatus(
      @Param("id") String id,
      @Param("successTime") LocalDateTime successTime,
      @Param("triggerStatus") String triggerStatus);

  @Update(
      "update schedule_rules set xxl_sync_status = 'SYNCING', "
          + "xxl_last_error_message = null, updated_at = current_timestamp "
          + "where id = #{id} and "
          + "(xxl_sync_status is null or xxl_sync_status in ('PENDING_SYNC', 'SYNC_FAILED'))")
  int markXxlSyncing(@Param("id") String id);

  @Update(
      "update schedule_rules set xxl_job_id = #{xxlJobId}, xxl_job_group = #{xxlJobGroup}, "
          + "xxl_executor_name = #{xxlExecutorName}, next_trigger_time = #{nextTriggerTime}, "
          + "xxl_sync_status = 'SYNCED', xxl_sync_hash = #{syncHash}, "
          + "xxl_last_sync_time = #{syncTime}, xxl_last_error_message = null, "
          + "xxl_sync_retry_count = 0, updated_at = current_timestamp where id = #{id}")
  int markXxlSynced(
      @Param("id") String id,
      @Param("xxlJobId") String xxlJobId,
      @Param("xxlJobGroup") String xxlJobGroup,
      @Param("xxlExecutorName") String xxlExecutorName,
      @Param("nextTriggerTime") LocalDateTime nextTriggerTime,
      @Param("syncTime") LocalDateTime syncTime,
      @Param("syncHash") String syncHash);

  @Update(
      "update schedule_rules set xxl_sync_status = 'SYNC_FAILED', "
          + "xxl_last_sync_time = #{syncTime}, xxl_last_error_message = #{errorMessage}, "
          + "xxl_sync_retry_count = xxl_sync_retry_count + 1, updated_at = current_timestamp "
          + "where id = #{id}")
  int markXxlSyncFailed(
      @Param("id") String id,
      @Param("syncTime") LocalDateTime syncTime,
      @Param("errorMessage") String errorMessage);

  @Update(
      "update schedule_rules set xxl_job_id = #{xxlJobId}, xxl_job_group = #{xxlJobGroup}, "
          + "xxl_executor_name = #{xxlExecutorName}, next_trigger_time = null, "
          + "xxl_sync_status = 'DISABLED', xxl_sync_hash = #{syncHash}, "
          + "xxl_last_sync_time = #{syncTime}, xxl_last_error_message = null, "
          + "xxl_sync_retry_count = 0, updated_at = current_timestamp where id = #{id}")
  int markXxlDisabled(
      @Param("id") String id,
      @Param("xxlJobId") String xxlJobId,
      @Param("xxlJobGroup") String xxlJobGroup,
      @Param("xxlExecutorName") String xxlExecutorName,
      @Param("syncTime") LocalDateTime syncTime,
      @Param("syncHash") String syncHash);
}
