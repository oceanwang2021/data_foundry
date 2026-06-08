package com.huatai.datafoundry.backend.schedule.interfaces.web.internal;

import com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand;
import com.huatai.datafoundry.backend.schedule.application.dto.ScheduleRuleDispatchResult;
import com.huatai.datafoundry.backend.schedule.application.service.ScheduleRuleDispatchAppService;
import com.huatai.datafoundry.backend.task.infrastructure.config.InternalCallbackProperties;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/internal/scheduler/rules")
public class SchedulerRuleDispatchController {
  private final ScheduleRuleDispatchAppService dispatchAppService;
  private final InternalCallbackProperties callbackProperties;

  public SchedulerRuleDispatchController(
      ScheduleRuleDispatchAppService dispatchAppService,
      InternalCallbackProperties callbackProperties) {
    this.dispatchAppService = dispatchAppService;
    this.callbackProperties = callbackProperties;
  }

  @PostMapping("/{ruleId}/dispatch")
  public ScheduleRuleDispatchResult dispatch(
      @RequestHeader(value = "X-Internal-Token", required = false) String internalToken,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
      @PathVariable("ruleId") String ruleId,
      @RequestBody(required = false) ScheduleRuleDispatchCommand command) {
    assertAuthorized(internalToken);
    return dispatchAppService.dispatch(ruleId, command, idempotencyKey);
  }

  private void assertAuthorized(String internalToken) {
    if (callbackProperties == null || !callbackProperties.isRequireToken()) return;
    String expected = callbackProperties.getToken();
    if (expected == null || expected.trim().isEmpty()) {
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR, "Internal token not configured");
    }
    if (!expected.equals(internalToken != null ? internalToken.trim() : "")) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
    }
  }
}
