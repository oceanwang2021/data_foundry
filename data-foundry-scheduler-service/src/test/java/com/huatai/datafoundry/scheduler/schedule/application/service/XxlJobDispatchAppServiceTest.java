package com.huatai.datafoundry.scheduler.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import org.junit.jupiter.api.Test;

class XxlJobDispatchAppServiceTest {
  private final XxlJobDispatchAppService service = new XxlJobDispatchAppService();

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
}
