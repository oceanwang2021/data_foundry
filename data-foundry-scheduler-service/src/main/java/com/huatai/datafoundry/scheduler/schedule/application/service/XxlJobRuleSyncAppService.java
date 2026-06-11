package com.huatai.datafoundry.scheduler.schedule.application.service;

import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.XxlJobAdminGateway;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class XxlJobRuleSyncAppService {
  private static final Logger log = LoggerFactory.getLogger(XxlJobRuleSyncAppService.class);

  private final BackendGateway backendGateway;
  private final XxlJobAdminGateway xxlJobAdminGateway;

  public XxlJobRuleSyncAppService(
      BackendGateway backendGateway, XxlJobAdminGateway xxlJobAdminGateway) {
    this.backendGateway = backendGateway;
    this.xxlJobAdminGateway = xxlJobAdminGateway;
  }

  public int synchronizePending(int batchSize) {
    List<XxlJobRuleSyncCommand> commands =
        backendGateway.claimPendingXxlJobRules(Math.max(1, batchSize));
    int processed = 0;
    for (XxlJobRuleSyncCommand command : commands) {
      XxlJobRuleSyncResult result;
      try {
        result = xxlJobAdminGateway.synchronize(command);
      } catch (Exception ex) {
        result = failed(command, ex);
        log.warn(
            "XXL-JOB rule synchronization failed: ruleId={}, error={}",
            command != null ? command.getRuleId() : null,
            ex.getMessage());
      }
      backendGateway.applyXxlJobRuleSyncResult(result);
      processed++;
    }
    return processed;
  }

  private static XxlJobRuleSyncResult failed(
      XxlJobRuleSyncCommand command, Exception exception) {
    XxlJobRuleSyncResult result = new XxlJobRuleSyncResult();
    result.setRuleId(command != null ? command.getRuleId() : null);
    result.setSyncHash(command != null ? command.getSyncHash() : null);
    result.setStatus("SYNC_FAILED");
    result.setErrorMessage(exception.getMessage());
    return result;
  }
}
