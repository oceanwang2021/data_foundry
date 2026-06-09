package com.huatai.datafoundry.scheduler.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.scheduler.schedule.application.dto.DispatchScheduleRuleCommand;
import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.domain.repository.ScheduleJobRepository;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class XxlJobDispatchAppServiceTest {
  private final BackendGateway backendGateway = Mockito.mock(BackendGateway.class);
  private final ScheduleJobRepository scheduleJobRepository =
      Mockito.mock(ScheduleJobRepository.class);
  private final XxlJobDispatchAppService service =
      new XxlJobDispatchAppService(backendGateway, scheduleJobRepository);

  @Test
  void preparesDefaultsAndNormalizesValues() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId(" rule-local ");
    param.setFrequency("monthly");

    ScheduleDispatchParam prepared = service.prepareDispatch(param);

    assertEquals("rule-local", prepared.getRuleId());
    assertEquals("MONTHLY", prepared.getFrequency());
    assertEquals("SCHEDULE", prepared.getTriggerType());
    assertEquals("PREVIOUS_PERIOD", prepared.getBusinessDateMode());
    assertEquals("system", prepared.getOperator());
    assertNull(prepared.getBusinessDate());
  }

  @Test
  void rejectsMissingRuleId() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();

    IllegalArgumentException error =
        assertThrows(IllegalArgumentException.class, () -> service.prepareDispatch(param));

    assertEquals("ruleId is required", error.getMessage());
  }

  @Test
  void acceptsWeeklyAndNormalizesExplicitBusinessDate() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId("rule-weekly");
    param.setFrequency("weekly");
    param.setBusinessDate("2026-W24");

    ScheduleDispatchParam prepared = service.prepareDispatch(param);

    assertEquals("WEEKLY", prepared.getFrequency());
    assertEquals("2026-W24", prepared.getBusinessDate());
  }

  @Test
  void rejectsInvalidWeeklyBusinessDateBeforeDispatch() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId("rule-weekly");
    param.setFrequency("WEEKLY");
    param.setBusinessDate("2026-W54");

    IllegalArgumentException error =
        assertThrows(IllegalArgumentException.class, () -> service.prepareDispatch(param));

    assertEquals("Invalid businessDate for WEEKLY: 2026-W54", error.getMessage());
  }

  @Test
  void rejectsUnknownFrequency() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId("rule-local");
    param.setFrequency("BIWEEKLY");

    IllegalArgumentException error =
        assertThrows(IllegalArgumentException.class, () -> service.prepareDispatch(param));

    assertEquals("Unsupported schedule frequency: BIWEEKLY", error.getMessage());
  }

  @Test
  void dispatchesNormalizedCommandToBackend() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId(" rule-local ");
    param.setFrequency("monthly");
    Map<String, Object> response = new HashMap<String, Object>();
    response.put("status", "DISPATCHED");
    response.put("task_group_id", "tg-1");
    response.put("business_date", "2026-05");
    when(backendGateway.dispatchScheduleRule(eq("rule-local"), Mockito.any(), eq("xxl:1")))
        .thenReturn(response);

    Map<String, Object> actual = service.dispatch(param, "{\"ruleId\":\"rule-local\"}", "5", "xxl:1");

    assertEquals("DISPATCHED", actual.get("status"));
    ArgumentCaptor<ScheduleJob> jobCaptor = ArgumentCaptor.forClass(ScheduleJob.class);
    verify(scheduleJobRepository).insert(jobCaptor.capture());
    ScheduleJob created = jobCaptor.getValue();
    assertEquals("RULE_DISPATCH", created.getJobSource());
    assertEquals("rule-local", created.getScheduleRuleId());
    assertEquals("RUNNING", created.getStatus());
    assertEquals("{\"ruleId\":\"rule-local\"}", created.getRequestPayload());

    ArgumentCaptor<Object> commandCaptor = ArgumentCaptor.forClass(Object.class);
    verify(backendGateway).dispatchScheduleRule(eq("rule-local"), commandCaptor.capture(), eq("xxl:1"));
    DispatchScheduleRuleCommand command = (DispatchScheduleRuleCommand) commandCaptor.getValue();
    assertEquals("XXL_JOB", command.getTriggerSource());
    assertEquals("MONTHLY", command.getFrequency());
    assertEquals(created.getId(), command.getScheduleJobId());
    verify(scheduleJobRepository)
        .updateDispatchResult(
            eq(created.getId()),
            eq("tg-1"),
            eq("2026-05"),
            eq("DISPATCHED"),
            Mockito.any(),
            isNull());
  }

  @Test
  void mapsBackendSkipToLocalSkippedRecord() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId("rule-local");
    Map<String, Object> response = new HashMap<String, Object>();
    response.put("status", "SKIPPED_ALREADY_EXISTS");
    response.put("task_group_id", "tg-existing");
    response.put("business_date", "2026-05");
    when(backendGateway.dispatchScheduleRule(eq("rule-local"), Mockito.any(), eq("xxl:skip")))
        .thenReturn(response);

    service.dispatch(param, "{}", "5", "xxl:skip");

    ArgumentCaptor<ScheduleJob> jobCaptor = ArgumentCaptor.forClass(ScheduleJob.class);
    verify(scheduleJobRepository).insert(jobCaptor.capture());
    verify(scheduleJobRepository)
        .updateDispatchResult(
            eq(jobCaptor.getValue().getId()),
            eq("tg-existing"),
            eq("2026-05"),
            eq("SKIPPED"),
            Mockito.any(),
            isNull());
  }

  @Test
  void recordsBackendFailureAndRethrows() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId("rule-local");
    when(backendGateway.dispatchScheduleRule(eq("rule-local"), Mockito.any(), eq("xxl:fail")))
        .thenThrow(new IllegalStateException("backend unavailable"));

    assertThrows(
        IllegalStateException.class,
        () -> service.dispatch(param, "{}", "5", "xxl:fail"));

    ArgumentCaptor<ScheduleJob> jobCaptor = ArgumentCaptor.forClass(ScheduleJob.class);
    verify(scheduleJobRepository).insert(jobCaptor.capture());
    verify(scheduleJobRepository)
        .updateDispatchResult(
            eq(jobCaptor.getValue().getId()),
            isNull(),
            isNull(),
            eq("FAILED"),
            Mockito.any(),
            eq("backend unavailable"));
  }
}
