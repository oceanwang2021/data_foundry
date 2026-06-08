package com.huatai.datafoundry.backend.schedule.infrastructure.repository;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleTriggerLog;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleTriggerLogRepository;
import com.huatai.datafoundry.backend.schedule.infrastructure.persistence.mybatis.mapper.ScheduleTriggerLogMapper;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisScheduleTriggerLogRepository implements ScheduleTriggerLogRepository {
  private final ScheduleTriggerLogMapper mapper;

  public MybatisScheduleTriggerLogRepository(ScheduleTriggerLogMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public int insert(ScheduleTriggerLog triggerLog) {
    return mapper.insert(triggerLog);
  }

  @Override
  public int updateResult(
      String id,
      String taskGroupId,
      String status,
      String skipReason,
      String errorMessage) {
    return mapper.updateResult(id, taskGroupId, status, skipReason, errorMessage);
  }

  @Override
  public int updateExecutionStatusByTaskGroup(
      String taskGroupId, String status, String errorMessage) {
    return mapper.updateExecutionStatusByTaskGroup(taskGroupId, status, errorMessage);
  }
}
