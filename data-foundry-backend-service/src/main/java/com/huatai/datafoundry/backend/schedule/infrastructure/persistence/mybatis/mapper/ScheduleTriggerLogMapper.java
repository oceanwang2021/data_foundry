package com.huatai.datafoundry.backend.schedule.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleTriggerLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ScheduleTriggerLogMapper {
  @Insert(
      "insert into schedule_trigger_logs (id, schedule_rule_id, schedule_job_id, task_group_id, "
          + "trigger_type, trigger_source, business_date, trigger_param_json, trigger_status, "
          + "skip_reason, error_message, started_at, ended_at) values "
          + "(#{id}, #{scheduleRuleId}, #{scheduleJobId}, #{taskGroupId}, #{triggerType}, "
          + "#{triggerSource}, #{businessDate}, #{triggerParamJson}, #{triggerStatus}, "
          + "#{skipReason}, #{errorMessage}, #{startedAt}, #{endedAt})")
  int insert(ScheduleTriggerLog triggerLog);

  @Update(
      "update schedule_trigger_logs set task_group_id = #{taskGroupId}, trigger_status = #{status}, "
          + "skip_reason = #{skipReason}, error_message = #{errorMessage}, ended_at = current_timestamp "
          + "where id = #{id}")
  int updateResult(
      @Param("id") String id,
      @Param("taskGroupId") String taskGroupId,
      @Param("status") String status,
      @Param("skipReason") String skipReason,
      @Param("errorMessage") String errorMessage);

  @Update(
      "update schedule_trigger_logs set trigger_status = #{status}, "
          + "error_message = #{errorMessage}, ended_at = current_timestamp "
          + "where task_group_id = #{taskGroupId} and trigger_status = 'DISPATCHED'")
  int updateExecutionStatusByTaskGroup(
      @Param("taskGroupId") String taskGroupId,
      @Param("status") String status,
      @Param("errorMessage") String errorMessage);
}
