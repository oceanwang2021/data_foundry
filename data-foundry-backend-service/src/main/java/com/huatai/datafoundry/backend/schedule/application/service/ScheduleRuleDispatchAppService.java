package com.huatai.datafoundry.backend.schedule.application.service;

import com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand;
import com.huatai.datafoundry.backend.schedule.application.dto.ScheduleRuleDispatchResult;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository;
import com.huatai.datafoundry.backend.schedule.domain.service.BusinessDateResolver;
import com.huatai.datafoundry.backend.schedule.domain.service.ScheduleTaskGroupBuilder;
import com.huatai.datafoundry.backend.task.application.service.TaskAppService;
import com.huatai.datafoundry.backend.task.application.service.TaskPlanAppService;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.contract.scheduler.ScheduleFrequency;
import java.time.LocalDateTime;
import java.util.Collections;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ScheduleRuleDispatchAppService {
  private final ScheduleRuleRepository scheduleRuleRepository;
  private final TaskGroupRepository taskGroupRepository;
  private final BusinessDateResolver businessDateResolver;
  private final ScheduleTaskGroupBuilder taskGroupBuilder;
  private final TaskPlanAppService taskPlanAppService;
  private final TaskAppService taskAppService;
  private final ScheduleTriggerLogAppService triggerLogAppService;

  public ScheduleRuleDispatchAppService(
      ScheduleRuleRepository scheduleRuleRepository,
      TaskGroupRepository taskGroupRepository,
      BusinessDateResolver businessDateResolver,
      ScheduleTaskGroupBuilder taskGroupBuilder,
      TaskPlanAppService taskPlanAppService,
      TaskAppService taskAppService,
      ScheduleTriggerLogAppService triggerLogAppService) {
    this.scheduleRuleRepository = scheduleRuleRepository;
    this.taskGroupRepository = taskGroupRepository;
    this.businessDateResolver = businessDateResolver;
    this.taskGroupBuilder = taskGroupBuilder;
    this.taskPlanAppService = taskPlanAppService;
    this.taskAppService = taskAppService;
    this.triggerLogAppService = triggerLogAppService;
  }

  @Transactional
  public ScheduleRuleDispatchResult dispatch(
      String ruleId, ScheduleRuleDispatchCommand command, String idempotencyKey) {
    if (command == null) command = new ScheduleRuleDispatchCommand();
    ScheduleRule rule = scheduleRuleRepository.getById(requireText(ruleId, "ruleId is required"));
    if (rule == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Schedule rule not found");
    }
    ScheduleFrequency ruleFrequency = ScheduleFrequency.parse(rule.getFrequency());
    String requestedFrequency = firstNonBlank(command.getFrequency());
    if (requestedFrequency != null
        && ruleFrequency != ScheduleFrequency.parse(requestedFrequency)) {
      throw new IllegalArgumentException(
          "Dispatch frequency does not match schedule rule: "
              + requestedFrequency
              + " != "
              + ruleFrequency.name());
    }
    command.setFrequency(ruleFrequency.name());
    String indicatorGroupId =
        requireText(rule.getIndicatorGroupId(), "Schedule rule indicatorGroupId is required");

    String businessDate = businessDateResolver.resolve(rule, command);
    String triggerLogId = triggerLogAppService.createRunning(rule.getId(), businessDate, command);
    LocalDateTime triggerTime = LocalDateTime.now();
    try {
      if (!Boolean.TRUE.equals(rule.getEnabled())) {
        triggerLogAppService.markSkipped(triggerLogId, null, "Schedule rule is disabled");
        scheduleRuleRepository.updateLastTrigger(
            rule.getId(), triggerTime, null, "SKIPPED_DISABLED");
        return result(rule.getId(), null, businessDate, triggerLogId, "SKIPPED_DISABLED");
      }

      TaskGroup existing =
          taskGroupRepository.getByScheduleRulePeriodAndIndicatorGroup(
              rule.getId(), businessDate, indicatorGroupId);
      if (existing != null) {
        triggerLogAppService.markSkipped(
            triggerLogId, existing.getId(), "Task group already exists for business date");
        scheduleRuleRepository.updateLastTrigger(
            rule.getId(), triggerTime, null, "SKIPPED_ALREADY_EXISTS");
        return result(
            rule.getId(),
            existing.getId(),
            businessDate,
            triggerLogId,
            "SKIPPED_ALREADY_EXISTS");
      }

      TaskGroup taskGroup = taskGroupBuilder.build(rule, command, businessDate);
      if (taskGroupRepository.insertIfAbsent(taskGroup) == 0) {
        TaskGroup concurrent =
            taskGroupRepository.getByScheduleRulePeriodAndIndicatorGroup(
                rule.getId(), businessDate, indicatorGroupId);
        String concurrentId = concurrent != null ? concurrent.getId() : taskGroup.getId();
        triggerLogAppService.markSkipped(
            triggerLogId, concurrentId, "Concurrent dispatch already created task group");
        return result(
            rule.getId(),
            concurrentId,
            businessDate,
            triggerLogId,
            "SKIPPED_ALREADY_EXISTS");
      }

      taskPlanAppService.ensureFetchTasksForScheduledTaskGroup(taskGroup);
      taskAppService.executeTaskGroup(
          taskGroup.getId(),
          Collections.<String, Object>emptyMap(),
          firstNonBlank(idempotencyKey, "schedule-rule:" + rule.getId() + ":" + businessDate));

      triggerLogAppService.markDispatched(triggerLogId, taskGroup.getId());
      scheduleRuleRepository.updateLastTrigger(
          rule.getId(), triggerTime, null, "DISPATCHED");
      return result(
          rule.getId(), taskGroup.getId(), businessDate, triggerLogId, "DISPATCHED");
    } catch (RuntimeException ex) {
      triggerLogAppService.markFailed(triggerLogId, ex.getMessage());
      scheduleRuleRepository.updateLastTrigger(rule.getId(), triggerTime, null, "FAILED");
      throw ex;
    }
  }

  private static ScheduleRuleDispatchResult result(
      String ruleId,
      String taskGroupId,
      String businessDate,
      String triggerLogId,
      String status) {
    ScheduleRuleDispatchResult result = new ScheduleRuleDispatchResult();
    result.setOk(!"FAILED".equals(status));
    result.setScheduleRuleId(ruleId);
    result.setTaskGroupId(taskGroupId);
    result.setBusinessDate(businessDate);
    result.setTriggerLogId(triggerLogId);
    result.setStatus(status);
    return result;
  }

  private static String requireText(String value, String message) {
    String normalized = firstNonBlank(value);
    if (normalized == null) throw new IllegalArgumentException(message);
    return normalized;
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }
}
