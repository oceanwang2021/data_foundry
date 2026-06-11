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
          + "xxl_job_id, last_trigger_time, last_success_time, last_trigger_status, next_trigger_time, "
          + "created_by, updated_by, created_at, updated_at from schedule_rules where id = #{id} limit 1")
  ScheduleRule getById(@Param("id") String id);

  @Insert({
      "<script>",
      "insert into schedule_rules (",
      "id, requirement_id, wide_table_id, indicator_group_id, rule_name, rule_code, frequency,",
      "cron_expression, business_date_mode, business_date_offset_days, trigger_time,",
      "xxl_job_handler, enabled, created_at, updated_at",
      ") values ",
      "<foreach collection='rules' item='r' separator=','>",
      "(#{r.id}, #{r.requirementId}, #{r.wideTableId}, #{r.indicatorGroupId}, #{r.ruleName},",
      " #{r.ruleCode}, #{r.frequency}, #{r.cronExpression}, #{r.businessDateMode},",
      " #{r.businessDateOffsetDays}, #{r.triggerTime}, #{r.xxlJobHandler}, #{r.enabled},",
      " current_timestamp, current_timestamp)",
      "</foreach>",
      "on duplicate key update ",
      "rule_name=values(rule_name), rule_code=values(rule_code), frequency=values(frequency),",
      "cron_expression=values(cron_expression), business_date_mode=values(business_date_mode),",
      "business_date_offset_days=values(business_date_offset_days), trigger_time=values(trigger_time),",
      "xxl_job_handler=values(xxl_job_handler), enabled=values(enabled), updated_at=current_timestamp",
      "</script>"
  })
  int upsertBatch(@Param("rules") List<ScheduleRule> rules);

  @Update(
      "update schedule_rules set enabled = 0, updated_at = current_timestamp "
          + "where requirement_id = #{requirementId} and wide_table_id = #{wideTableId}")
  int disableByWideTable(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId);

  @Update({
      "<script>",
      "update schedule_rules set enabled = 0, updated_at = current_timestamp ",
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
}
