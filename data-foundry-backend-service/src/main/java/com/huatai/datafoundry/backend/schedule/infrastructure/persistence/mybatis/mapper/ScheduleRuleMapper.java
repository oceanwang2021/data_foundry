package com.huatai.datafoundry.backend.schedule.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ScheduleRuleMapper {
  @Select(
      "select id, requirement_id, wide_table_id, indicator_group_id, rule_name, rule_code, frequency, cron_expression, "
          + "business_date_mode, enabled, xxl_job_group, xxl_executor_name, xxl_job_handler, "
          + "xxl_job_id, last_trigger_time, last_success_time, last_trigger_status, next_trigger_time, "
          + "created_by, updated_by, created_at, updated_at from schedule_rules where id = #{id} limit 1")
  ScheduleRule getById(@Param("id") String id);

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
}
