package com.huatai.datafoundry.backend.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.backend.requirement.domain.model.WideTable;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.schedule.domain.service.SchedulePlanningTimeCalculator;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;

class SchedulePlanRefreshAppServiceTest {

  @Test
  void refreshesOnlyPendingScheduledTaskGroups() {
    ScheduleRuleSyncAppService syncService = Mockito.mock(ScheduleRuleSyncAppService.class);
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    SchedulePlanRefreshAppService service =
        new SchedulePlanRefreshAppService(
            syncService, new SchedulePlanningTimeCalculator(), taskGroupRepository);

    WideTable wideTable = new WideTable();
    wideTable.setId("WT1");
    wideTable.setRequirementId("R1");
    wideTable.setIndicatorGroupsJson("[{\"id\":\"ig-1\"}]");
    wideTable.setScheduleRulesJson(
        "[{\"frequency\":\"MONTHLY\",\"trigger_time\":\"07:45\","
            + "\"business_date_offset_days\":1}]");

    ScheduleRule rule = new ScheduleRule();
    rule.setId("sr-1");
    rule.setIndicatorGroupId("ig-1");
    rule.setFrequency("MONTHLY");
    rule.setBusinessDateOffsetDays(Integer.valueOf(1));
    rule.setTriggerTime(LocalTime.of(7, 45));
    when(syncService.sync(ArgumentMatchers.any(WideTablePlanSource.class)))
        .thenReturn(Collections.singletonMap("ig-1", rule));

    TaskGroup pending = taskGroup("TG_PENDING", "pending", "SCHEDULED", "2026-12");
    TaskGroup completed = taskGroup("TG_COMPLETED", "completed", "SCHEDULED", "2026-11");
    TaskGroup backfill = taskGroup("TG_BACKFILL", "pending", "BACKFILL", "2026-10");
    when(taskGroupRepository.listByRequirementAndWideTable("R1", "WT1"))
        .thenReturn(Arrays.asList(pending, completed, backfill));
    when(taskGroupRepository.updatePendingSchedule(
        "TG_PENDING", "sr-1", LocalDateTime.of(2027, 1, 1, 7, 45)))
        .thenReturn(1);

    int updated = service.refresh(wideTable);

    assertEquals(1, updated);
    verify(taskGroupRepository).updatePendingSchedule(
        "TG_PENDING", "sr-1", LocalDateTime.of(2027, 1, 1, 7, 45));
    verify(taskGroupRepository, never()).updatePendingSchedule(
        Mockito.eq("TG_COMPLETED"), Mockito.anyString(), Mockito.any(LocalDateTime.class));
    verify(taskGroupRepository, never()).updatePendingSchedule(
        Mockito.eq("TG_BACKFILL"), Mockito.anyString(), Mockito.any(LocalDateTime.class));
  }

  private static TaskGroup taskGroup(
      String id, String status, String sourceType, String businessDate) {
    TaskGroup taskGroup = new TaskGroup();
    taskGroup.setId(id);
    taskGroup.setStatus(status);
    taskGroup.setSourceType(sourceType);
    taskGroup.setBusinessDate(businessDate);
    taskGroup.setIndicatorGroupId("ig-1");
    return taskGroup;
  }
}
