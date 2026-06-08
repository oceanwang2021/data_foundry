package com.huatai.datafoundry.backend.schedule.application.service;

import com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleTriggerLog;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleTriggerLogRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduleTriggerLogAppService {
  private final ScheduleTriggerLogRepository repository;

  public ScheduleTriggerLogAppService(ScheduleTriggerLogRepository repository) {
    this.repository = repository;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public String createRunning(
      String ruleId, String businessDate, ScheduleRuleDispatchCommand command) {
    ScheduleTriggerLog triggerLog = new ScheduleTriggerLog();
    triggerLog.setId("stl_" + UUID.randomUUID().toString().replace("-", ""));
    triggerLog.setScheduleRuleId(ruleId);
    triggerLog.setScheduleJobId(command.getScheduleJobId());
    triggerLog.setTriggerType(defaultValue(command.getTriggerType(), "SCHEDULE"));
    triggerLog.setTriggerSource(defaultValue(command.getTriggerSource(), "XXL_JOB"));
    triggerLog.setBusinessDate(businessDate);
    triggerLog.setTriggerParamJson(command.getXxlJobParam());
    triggerLog.setTriggerStatus("RUNNING");
    triggerLog.setStartedAt(LocalDateTime.now());
    repository.insert(triggerLog);
    return triggerLog.getId();
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void markDispatched(String id, String taskGroupId) {
    repository.updateResult(id, taskGroupId, "DISPATCHED", null, null);
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void markSkipped(String id, String taskGroupId, String reason) {
    repository.updateResult(id, taskGroupId, "SKIPPED", reason, null);
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void markFailed(String id, String errorMessage) {
    repository.updateResult(id, null, "FAILED", null, truncate(errorMessage));
  }

  private static String defaultValue(String value, String fallback) {
    return value != null && !value.trim().isEmpty() ? value.trim().toUpperCase() : fallback;
  }

  private static String truncate(String value) {
    if (value == null || value.length() <= 2000) return value;
    return value.substring(0, 2000);
  }
}
