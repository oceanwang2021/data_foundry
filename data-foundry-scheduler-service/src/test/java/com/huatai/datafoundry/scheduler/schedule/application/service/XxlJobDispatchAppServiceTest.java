package com.huatai.datafoundry.scheduler.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.scheduler.schedule.application.dto.DispatchScheduleRuleCommand;
import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import java.util.Collections;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class XxlJobDispatchAppServiceTest {
  private final BackendGateway backendGateway = Mockito.mock(BackendGateway.class);
  private final XxlJobDispatchAppService service = new XxlJobDispatchAppService(backendGateway);

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
  void dispatchesNormalizedCommandToBackend() {
    ScheduleDispatchParam param = new ScheduleDispatchParam();
    param.setRuleId(" rule-local ");
    param.setFrequency("monthly");
    Map<String, Object> response = Collections.<String, Object>singletonMap("status", "DISPATCHED");
    when(backendGateway.dispatchScheduleRule(eq("rule-local"), Mockito.any(), eq("xxl:1")))
        .thenReturn(response);

    Map<String, Object> actual = service.dispatch(param, "{\"ruleId\":\"rule-local\"}", "5", "xxl:1");

    assertEquals("DISPATCHED", actual.get("status"));
    ArgumentCaptor<Object> commandCaptor = ArgumentCaptor.forClass(Object.class);
    verify(backendGateway).dispatchScheduleRule(eq("rule-local"), commandCaptor.capture(), eq("xxl:1"));
    DispatchScheduleRuleCommand command = (DispatchScheduleRuleCommand) commandCaptor.getValue();
    assertEquals("XXL_JOB", command.getTriggerSource());
    assertEquals("MONTHLY", command.getFrequency());
    assertEquals("5", command.getScheduleJobId());
  }
}
