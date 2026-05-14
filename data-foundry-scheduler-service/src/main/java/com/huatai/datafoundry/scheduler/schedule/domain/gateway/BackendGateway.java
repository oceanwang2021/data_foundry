package com.huatai.datafoundry.scheduler.schedule.domain.gateway;

import java.util.Map;

public interface BackendGateway {
  void callbackExecutionResult(Map<String, Object> body, String idempotencyKey);

  Map<String, Object> getFetchTaskPrompt(String taskId, String idempotencyKey);
}
