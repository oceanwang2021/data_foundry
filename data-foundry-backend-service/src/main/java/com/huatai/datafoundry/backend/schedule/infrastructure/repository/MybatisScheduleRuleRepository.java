package com.huatai.datafoundry.backend.schedule.infrastructure.repository;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository;
import com.huatai.datafoundry.backend.schedule.infrastructure.persistence.mybatis.mapper.ScheduleRuleMapper;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisScheduleRuleRepository implements ScheduleRuleRepository {
  private final ScheduleRuleMapper mapper;

  public MybatisScheduleRuleRepository(ScheduleRuleMapper mapper) {
    this.mapper = mapper;
  }

  @Override
  public ScheduleRule getById(String id) {
    return mapper.getById(id);
  }

  @Override
  public List<ScheduleRule> listByWideTable(String requirementId, String wideTableId) {
    return mapper.listByWideTable(requirementId, wideTableId);
  }

  @Override
  public List<ScheduleRule> listPendingXxlSync(int limit) {
    return mapper.listPendingXxlSync(Math.max(1, limit));
  }

  @Override
  public int upsertBatch(List<ScheduleRule> rules) {
    return rules == null || rules.isEmpty() ? 0 : mapper.upsertBatch(rules);
  }

  @Override
  public int disableByWideTable(String requirementId, String wideTableId) {
    return mapper.disableByWideTable(requirementId, wideTableId);
  }

  @Override
  public int disableMissingIndicatorGroups(
      String requirementId, String wideTableId, Collection<String> indicatorGroupIds) {
    return mapper.disableMissingIndicatorGroups(
        requirementId, wideTableId, indicatorGroupIds);
  }

  @Override
  public int updateLastTrigger(
      String id, LocalDateTime triggerTime, LocalDateTime successTime, String triggerStatus) {
    return mapper.updateLastTrigger(id, triggerTime, successTime, triggerStatus);
  }

  @Override
  public int updateExecutionStatus(
      String id, LocalDateTime successTime, String triggerStatus) {
    return mapper.updateExecutionStatus(id, successTime, triggerStatus);
  }

  @Override
  public int markXxlSyncing(String id) {
    return mapper.markXxlSyncing(id);
  }

  @Override
  public int markXxlSynced(
      String id,
      String xxlJobId,
      String xxlJobGroup,
      String xxlExecutorName,
      LocalDateTime nextTriggerTime,
      LocalDateTime syncTime,
      String syncHash) {
    return mapper.markXxlSynced(
        id,
        xxlJobId,
        xxlJobGroup,
        xxlExecutorName,
        nextTriggerTime,
        syncTime,
        syncHash);
  }

  @Override
  public int markXxlSyncFailed(String id, LocalDateTime syncTime, String errorMessage) {
    return mapper.markXxlSyncFailed(id, syncTime, errorMessage);
  }

  @Override
  public int markXxlDisabled(
      String id,
      String xxlJobId,
      String xxlJobGroup,
      String xxlExecutorName,
      LocalDateTime syncTime,
      String syncHash) {
    return mapper.markXxlDisabled(
        id, xxlJobId, xxlJobGroup, xxlExecutorName, syncTime, syncHash);
  }
}
