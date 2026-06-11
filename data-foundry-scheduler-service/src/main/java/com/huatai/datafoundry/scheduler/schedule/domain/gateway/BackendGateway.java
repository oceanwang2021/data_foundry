package com.huatai.datafoundry.scheduler.schedule.domain.gateway;

import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import java.util.List;
import java.util.Map;

public interface BackendGateway {
  Map<String, Object> dispatchScheduleRule(
      String ruleId, Object body, String idempotencyKey);

  void callbackExecutionResult(Map<String, Object> body, String idempotencyKey);

  Map<String, Object> getFetchTaskPrompt(String taskId, String idempotencyKey);

  List<XxlJobRuleSyncCommand> claimPendingXxlJobRules(int limit);

  void applyXxlJobRuleSyncResult(XxlJobRuleSyncResult result);
}
