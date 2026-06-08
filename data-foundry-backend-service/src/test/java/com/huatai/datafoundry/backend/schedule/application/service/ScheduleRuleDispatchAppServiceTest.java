package com.huatai.datafoundry.backend.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class ScheduleRuleDispatchAppServiceTest {
  private ScheduleRuleRepository ruleRepository;
  private TaskGroupRepository taskGroupRepository;
  private TaskPlanAppService taskPlanAppService;
  private TaskAppService taskAppService;
  private ScheduleTriggerLogAppService triggerLogAppService;
  private ScheduleRuleDispatchAppService service;

  @BeforeEach
  void setUp() {
    ruleRepository = Mockito.mock(ScheduleRuleRepository.class);
    taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    taskPlanAppService = Mockito.mock(TaskPlanAppService.class);
    taskAppService = Mockito.mock(TaskAppService.class);
    triggerLogAppService = Mockito.mock(ScheduleTriggerLogAppService.class);
    when(triggerLogAppService.createRunning(any(), any(), any())).thenReturn("stl-1");
    service =
        new ScheduleRuleDispatchAppService(
            ruleRepository,
            taskGroupRepository,
            new BusinessDateResolver(),
            new ScheduleTaskGroupBuilder(),
            taskPlanAppService,
            taskAppService,
            triggerLogAppService);
  }

  @Test
  void skipsDisabledRule() {
    ScheduleRule rule = rule(false);
    when(ruleRepository.getById("rule-1")).thenReturn(rule);

    ScheduleRuleDispatchResult result =
        service.dispatch("rule-1", command("2026-05"), "key-1");

    assertEquals("SKIPPED_DISABLED", result.getStatus());
    verify(taskGroupRepository, never()).insertIfAbsent(any());
  }

  @Test
  void skipsExistingBusinessPeriod() {
    ScheduleRule rule = rule(true);
    TaskGroup existing = new TaskGroup();
    existing.setId("tg-existing");
    when(ruleRepository.getById("rule-1")).thenReturn(rule);
    when(
            taskGroupRepository.getByScheduleRulePeriodAndIndicatorGroup(
                "rule-1", "2026-05", "ig-1"))
        .thenReturn(existing);

    ScheduleRuleDispatchResult result =
        service.dispatch("rule-1", command("2026-05"), "key-1");

    assertEquals("SKIPPED_ALREADY_EXISTS", result.getStatus());
    assertEquals("tg-existing", result.getTaskGroupId());
    verify(taskAppService, never()).executeTaskGroup(any(), any(), any());
  }

  @Test
  void createsTasksAndExecutesNewPeriod() {
    ScheduleRule rule = rule(true);
    when(ruleRepository.getById("rule-1")).thenReturn(rule);
    when(taskGroupRepository.insertIfAbsent(any())).thenReturn(1);

    ScheduleRuleDispatchResult result =
        service.dispatch("rule-1", command("2026-05"), "key-1");

    assertEquals("DISPATCHED", result.getStatus());
    ArgumentCaptor<TaskGroup> captor = ArgumentCaptor.forClass(TaskGroup.class);
    verify(taskPlanAppService).ensureFetchTasksForScheduledTaskGroup(captor.capture());
    assertEquals("ig-1", captor.getValue().getIndicatorGroupId());
    assertEquals("ig-1", captor.getValue().getPartitionKey());
    verify(taskAppService).executeTaskGroup(any(), any(), org.mockito.ArgumentMatchers.eq("key-1"));
    verify(triggerLogAppService).markDispatched("stl-1", result.getTaskGroupId());
  }

  private static ScheduleRule rule(boolean enabled) {
    ScheduleRule rule = new ScheduleRule();
    rule.setId("rule-1");
    rule.setRequirementId("req-1");
    rule.setWideTableId("wt-1");
    rule.setIndicatorGroupId("ig-1");
    rule.setRuleName("Monthly rule");
    rule.setFrequency("MONTHLY");
    rule.setBusinessDateMode("PREVIOUS_PERIOD");
    rule.setEnabled(enabled);
    return rule;
  }

  private static ScheduleRuleDispatchCommand command(String businessDate) {
    ScheduleRuleDispatchCommand command = new ScheduleRuleDispatchCommand();
    command.setBusinessDate(businessDate);
    command.setTriggerType("SCHEDULE");
    command.setOperator("system");
    return command;
  }
}
