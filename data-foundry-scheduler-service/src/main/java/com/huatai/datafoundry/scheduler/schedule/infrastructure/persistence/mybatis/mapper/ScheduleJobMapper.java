package com.huatai.datafoundry.scheduler.schedule.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.scheduler.schedule.infrastructure.persistence.mybatis.record.ScheduleJobRecord;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ScheduleJobMapper {
  @Select({
      "<script>",
      "select id, task_group_id, task_id, job_source, schedule_rule_id, business_date, request_payload, error_message,",
      "trigger_type, status, started_at, ended_at, operator, log_ref",
      "from schedule_jobs",
      "<where>",
      "<if test='triggerType != null and triggerType != \"\"'> and trigger_type = #{triggerType}</if>",
      "<if test='status != null and status != \"\"'> and status = #{status}</if>",
      "<if test='taskGroupId != null and taskGroupId != \"\"'> and task_group_id = #{taskGroupId}</if>",
      "<if test='scheduleRuleId != null and scheduleRuleId != \"\"'> and schedule_rule_id = #{scheduleRuleId}</if>",
      "<if test='jobSource != null and jobSource != \"\"'> and job_source = #{jobSource}</if>",
      "</where>",
      "order by created_at desc",
      "</script>"
  })
  List<ScheduleJobRecord> list(
      @Param("triggerType") String triggerType,
      @Param("status") String status,
      @Param("taskGroupId") String taskGroupId,
      @Param("scheduleRuleId") String scheduleRuleId,
      @Param("jobSource") String jobSource);

  @Select(
      "select id, task_group_id, task_id, job_source, schedule_rule_id, business_date, "
          + "request_payload, error_message, trigger_type, status, started_at, ended_at, operator, log_ref "
          + "from schedule_jobs where id = #{id}")
  ScheduleJobRecord get(@Param("id") String id);

  @Insert(
      "insert into schedule_jobs (id, task_group_id, task_id, job_source, schedule_rule_id, "
          + "business_date, request_payload, error_message, trigger_type, status, started_at, "
          + "ended_at, operator, log_ref) values (#{id}, #{taskGroupId}, #{taskId}, #{jobSource}, "
          + "#{scheduleRuleId}, #{businessDate}, #{requestPayload}, #{errorMessage}, #{triggerType}, "
          + "#{status}, #{startedAt}, #{endedAt}, #{operator}, #{logRef})")
  int insert(ScheduleJobRecord record);

  @Update("update schedule_jobs set status = #{status}, ended_at = #{endedAt}, log_ref = #{logRef} where id = #{id}")
  int updateStatus(@Param("id") String id, @Param("status") String status, @Param("endedAt") String endedAt, @Param("logRef") String logRef);

  @Update(
      "update schedule_jobs set task_group_id = #{taskGroupId}, business_date = #{businessDate}, "
          + "status = #{status}, ended_at = #{endedAt}, error_message = #{errorMessage} where id = #{id}")
  int updateDispatchResult(
      @Param("id") String id,
      @Param("taskGroupId") String taskGroupId,
      @Param("businessDate") String businessDate,
      @Param("status") String status,
      @Param("endedAt") String endedAt,
      @Param("errorMessage") String errorMessage);
}
