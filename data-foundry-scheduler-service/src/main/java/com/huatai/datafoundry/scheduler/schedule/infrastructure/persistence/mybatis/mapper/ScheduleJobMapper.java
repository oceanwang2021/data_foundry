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
      "select id, task_group_id, task_id, trigger_type, status, started_at, ended_at, operator, log_ref",
      "from schedule_jobs",
      "<where>",
      "<if test='triggerType != null and triggerType != \"\"'> and trigger_type = #{triggerType}</if>",
      "<if test='status != null and status != \"\"'> and status = #{status}</if>",
      "</where>",
      "order by created_at desc",
      "</script>"
  })
  List<ScheduleJobRecord> list(@Param("triggerType") String triggerType, @Param("status") String status);

  @Select("select id, task_group_id, task_id, trigger_type, status, started_at, ended_at, operator, log_ref from schedule_jobs where id = #{id}")
  ScheduleJobRecord get(@Param("id") String id);

  @Insert("insert into schedule_jobs (id, task_group_id, task_id, trigger_type, status, started_at, operator, log_ref) values (#{id}, #{taskGroupId}, #{taskId}, #{triggerType}, #{status}, #{startedAt}, #{operator}, #{logRef})")
  int insert(ScheduleJobRecord record);

  @Update("update schedule_jobs set status = #{status}, ended_at = #{endedAt}, log_ref = #{logRef} where id = #{id}")
  int updateStatus(@Param("id") String id, @Param("status") String status, @Param("endedAt") String endedAt, @Param("logRef") String logRef);
}
