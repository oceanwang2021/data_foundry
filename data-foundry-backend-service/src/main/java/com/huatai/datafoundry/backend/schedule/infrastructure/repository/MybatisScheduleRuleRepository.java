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
}
