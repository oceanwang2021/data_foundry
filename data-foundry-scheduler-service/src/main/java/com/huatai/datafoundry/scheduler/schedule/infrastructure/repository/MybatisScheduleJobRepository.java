package com.huatai.datafoundry.scheduler.schedule.infrastructure.repository;

import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.domain.repository.ScheduleJobRepository;
import com.huatai.datafoundry.scheduler.schedule.infrastructure.persistence.mybatis.mapper.ScheduleJobMapper;
import com.huatai.datafoundry.scheduler.schedule.infrastructure.persistence.mybatis.record.ScheduleJobRecord;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisScheduleJobRepository implements ScheduleJobRepository {
  private final ScheduleJobMapper mapper;

  public MybatisScheduleJobRepository(ScheduleJobMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public List<ScheduleJob> list(
      String triggerType,
      String status,
      String taskGroupId,
      String scheduleRuleId,
      String jobSource) {
    List<ScheduleJobRecord> records =
        mapper.list(triggerType, status, taskGroupId, scheduleRuleId, jobSource);
    if (records == null) return new ArrayList<ScheduleJob>();
    List<ScheduleJob> out = new ArrayList<ScheduleJob>(records.size());
    for (ScheduleJobRecord r : records) {
      if (r == null) continue;
      out.add(toDomain(r));
    }
    return out;
  }

  @Override
  public ScheduleJob get(String jobId) {
    ScheduleJobRecord record = mapper.get(jobId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public int insert(ScheduleJob scheduleJob) {
    return mapper.insert(toRecord(scheduleJob));
  }

  @Override
  public int updateStatus(String jobId, String status, String endedAt, String logRef) {
    return mapper.updateStatus(jobId, status, endedAt, logRef);
  }

  @Override
  public int updateDispatchResult(
      String jobId,
      String taskGroupId,
      String businessDate,
      String status,
      String endedAt,
      String errorMessage) {
    return mapper.updateDispatchResult(
        jobId, taskGroupId, businessDate, status, endedAt, errorMessage);
  }

  private static ScheduleJob toDomain(ScheduleJobRecord record) {
    ScheduleJob job = new ScheduleJob();
    job.setId(record.getId());
    job.setTaskGroupId(record.getTaskGroupId());
    job.setTaskId(record.getTaskId());
    job.setJobSource(record.getJobSource());
    job.setScheduleRuleId(record.getScheduleRuleId());
    job.setBusinessDate(record.getBusinessDate());
    job.setRequestPayload(record.getRequestPayload());
    job.setErrorMessage(record.getErrorMessage());
    job.setTriggerType(record.getTriggerType());
    job.setStatus(record.getStatus());
    job.setStartedAt(record.getStartedAt());
    job.setEndedAt(record.getEndedAt());
    job.setOperator(record.getOperator());
    job.setLogRef(record.getLogRef());
    return job;
  }

  private static ScheduleJobRecord toRecord(ScheduleJob job) {
    if (job == null) return null;
    ScheduleJobRecord record = new ScheduleJobRecord();
    record.setId(job.getId());
    record.setTaskGroupId(job.getTaskGroupId());
    record.setTaskId(job.getTaskId());
    record.setJobSource(job.getJobSource());
    record.setScheduleRuleId(job.getScheduleRuleId());
    record.setBusinessDate(job.getBusinessDate());
    record.setRequestPayload(job.getRequestPayload());
    record.setErrorMessage(job.getErrorMessage());
    record.setTriggerType(job.getTriggerType());
    record.setStatus(job.getStatus());
    record.setStartedAt(job.getStartedAt());
    record.setEndedAt(job.getEndedAt());
    record.setOperator(job.getOperator());
    record.setLogRef(job.getLogRef());
    return record;
  }
}
