package com.huatai.datafoundry.backend.schedule.application.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleTriggerLogRepository;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class ScheduleExecutionStatusAppServiceTest {

  @Test
  void completedTaskGroupMarksRuleAndTriggerLogCompleted() {
    ScheduleRuleRepository ruleRepository = Mockito.mock(ScheduleRuleRepository.class);
    ScheduleTriggerLogRepository triggerLogRepository =
        Mockito.mock(ScheduleTriggerLogRepository.class);
    ScheduleExecutionStatusAppService service =
        new ScheduleExecutionStatusAppService(ruleRepository, triggerLogRepository);

    TaskGroup taskGroup = scheduledTaskGroup("completed");
    service.updateFromTaskGroup(taskGroup);

    verify(ruleRepository).updateExecutionStatus(eq("rule-1"), any(), eq("COMPLETED"));
    verify(triggerLogRepository)
        .updateExecutionStatusByTaskGroup("tg-1", "COMPLETED", null);
  }

  @Test
  void failedTaskGroupDoesNotUpdateLastSuccessTime() {
    ScheduleRuleRepository ruleRepository = Mockito.mock(ScheduleRuleRepository.class);
    ScheduleTriggerLogRepository triggerLogRepository =
        Mockito.mock(ScheduleTriggerLogRepository.class);
    ScheduleExecutionStatusAppService service =
        new ScheduleExecutionStatusAppService(ruleRepository, triggerLogRepository);

    service.updateFromTaskGroup(scheduledTaskGroup("failed"));

    verify(ruleRepository).updateExecutionStatus(eq("rule-1"), isNull(), eq("FAILED"));
    verify(triggerLogRepository)
        .updateExecutionStatusByTaskGroup(
            "tg-1", "FAILED", "Task group finished with status FAILED");
  }

  @Test
  void runningTaskGroupDoesNotUpdateScheduleState() {
    ScheduleRuleRepository ruleRepository = Mockito.mock(ScheduleRuleRepository.class);
    ScheduleTriggerLogRepository triggerLogRepository =
        Mockito.mock(ScheduleTriggerLogRepository.class);
    ScheduleExecutionStatusAppService service =
        new ScheduleExecutionStatusAppService(ruleRepository, triggerLogRepository);

    service.updateFromTaskGroup(scheduledTaskGroup("running"));

    verify(ruleRepository, never()).updateExecutionStatus(any(), any(), any());
    verify(triggerLogRepository, never())
        .updateExecutionStatusByTaskGroup(any(), any(), any());
  }

  private static TaskGroup scheduledTaskGroup(String status) {
    TaskGroup taskGroup = new TaskGroup();
    taskGroup.setId("tg-1");
    taskGroup.setScheduleRuleId("rule-1");
    taskGroup.setStatus(status);
    return taskGroup;
  }
}
