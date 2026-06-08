package com.huatai.datafoundry.backend.schedule.application.service;

import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleTriggerLogRepository;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;

@Service
public class ScheduleExecutionStatusAppService {
  private final ScheduleRuleRepository scheduleRuleRepository;
  private final ScheduleTriggerLogRepository triggerLogRepository;

  public ScheduleExecutionStatusAppService(
      ScheduleRuleRepository scheduleRuleRepository,
      ScheduleTriggerLogRepository triggerLogRepository) {
    this.scheduleRuleRepository = scheduleRuleRepository;
    this.triggerLogRepository = triggerLogRepository;
  }

  public void updateFromTaskGroup(TaskGroup taskGroup) {
    if (taskGroup == null
        || isBlank(taskGroup.getScheduleRuleId())
        || isBlank(taskGroup.getId())) {
      return;
    }
    String status = normalizeTerminalStatus(taskGroup.getStatus());
    if (status == null) {
      return;
    }
    LocalDateTime successTime = "COMPLETED".equals(status) ? LocalDateTime.now() : null;
    scheduleRuleRepository.updateExecutionStatus(
        taskGroup.getScheduleRuleId(), successTime, status);
    triggerLogRepository.updateExecutionStatusByTaskGroup(
        taskGroup.getId(),
        status,
        "COMPLETED".equals(status) ? null : "Task group finished with status " + status);
  }

  private static String normalizeTerminalStatus(String rawStatus) {
    if (rawStatus == null) return null;
    String status = rawStatus.trim().toUpperCase();
    if ("COMPLETED".equals(status)
        || "FAILED".equals(status)
        || "PARTIAL".equals(status)
        || "CANCELLED".equals(status)
        || "INVALIDATED".equals(status)) {
      return status;
    }
    return null;
  }

  private static boolean isBlank(String value) {
    return value == null || value.trim().isEmpty();
  }
}
