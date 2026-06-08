package com.huatai.datafoundry.scheduler.schedule.domain.gateway;

import java.util.Map;

public interface BackendGateway {
  Map<String, Object> dispatchScheduleRule(
      String ruleId, Object body, String idempotencyKey);

  void callbackExecutionResult(Map<String, Object> body, String idempotencyKey);

  Map<String, Object> getFetchTaskPrompt(String taskId, String idempotencyKey);
}
