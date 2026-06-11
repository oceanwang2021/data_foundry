package com.huatai.datafoundry.scheduler.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.XxlJobAdminGateway;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class XxlJobRuleSyncAppServiceTest {
  private BackendGateway backendGateway;
  private XxlJobAdminGateway adminGateway;
  private XxlJobRuleSyncAppService service;

  @BeforeEach
  void setUp() {
    backendGateway = Mockito.mock(BackendGateway.class);
    adminGateway = Mockito.mock(XxlJobAdminGateway.class);
    service = new XxlJobRuleSyncAppService(backendGateway, adminGateway);
  }

  @Test
  void synchronizesClaimedRuleAndAppliesResult() {
    XxlJobRuleSyncCommand command = command();
    XxlJobRuleSyncResult result = result("SYNCED");
    when(backendGateway.claimPendingXxlJobRules(20))
        .thenReturn(Collections.singletonList(command));
    when(adminGateway.synchronize(command)).thenReturn(result);

    assertEquals(1, service.synchronizePending(20));

    verify(backendGateway).applyXxlJobRuleSyncResult(result);
  }

  @Test
  void reportsAdminFailureBackToBackend() {
    XxlJobRuleSyncCommand command = command();
    when(backendGateway.claimPendingXxlJobRules(1))
        .thenReturn(Collections.singletonList(command));
    when(adminGateway.synchronize(command))
        .thenThrow(new IllegalStateException("Admin unavailable"));

    assertEquals(1, service.synchronizePending(0));

    ArgumentCaptor<XxlJobRuleSyncResult> captor =
        ArgumentCaptor.forClass(XxlJobRuleSyncResult.class);
    verify(backendGateway).applyXxlJobRuleSyncResult(captor.capture());
    assertEquals("rule-1", captor.getValue().getRuleId());
    assertEquals("hash-1", captor.getValue().getSyncHash());
    assertEquals("SYNC_FAILED", captor.getValue().getStatus());
    assertEquals("Admin unavailable", captor.getValue().getErrorMessage());
  }

  private static XxlJobRuleSyncCommand command() {
    XxlJobRuleSyncCommand command = new XxlJobRuleSyncCommand();
    command.setRuleId("rule-1");
    command.setSyncHash("hash-1");
    return command;
  }

  private static XxlJobRuleSyncResult result(String status) {
    XxlJobRuleSyncResult result = new XxlJobRuleSyncResult();
    result.setRuleId("rule-1");
    result.setSyncHash("hash-1");
    result.setStatus(status);
    return result;
  }
}
