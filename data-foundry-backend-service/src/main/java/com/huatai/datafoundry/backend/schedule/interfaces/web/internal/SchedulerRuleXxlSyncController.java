package com.huatai.datafoundry.backend.schedule.interfaces.web.internal;

import com.huatai.datafoundry.backend.schedule.application.service.ScheduleRuleXxlSyncStateAppService;
import com.huatai.datafoundry.backend.task.infrastructure.config.InternalCallbackProperties;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/internal/scheduler/rules/xxl-sync")
public class SchedulerRuleXxlSyncController {
  private final ScheduleRuleXxlSyncStateAppService syncStateAppService;
  private final InternalCallbackProperties callbackProperties;

  public SchedulerRuleXxlSyncController(
      ScheduleRuleXxlSyncStateAppService syncStateAppService,
      InternalCallbackProperties callbackProperties) {
    this.syncStateAppService = syncStateAppService;
    this.callbackProperties = callbackProperties;
  }

  @PostMapping("/claim")
  public List<XxlJobRuleSyncCommand> claim(
      @RequestHeader(value = "X-Internal-Token", required = false) String internalToken,
      @RequestParam(value = "limit", required = false) Integer limit) {
    assertAuthorized(internalToken);
    return syncStateAppService.claimPending(limit);
  }

  @PostMapping("/result")
  public void applyResult(
      @RequestHeader(value = "X-Internal-Token", required = false) String internalToken,
      @RequestBody XxlJobRuleSyncResult result) {
    assertAuthorized(internalToken);
    syncStateAppService.applyResult(result);
  }

  private void assertAuthorized(String internalToken) {
    if (callbackProperties == null || !callbackProperties.isRequireToken()) {
      return;
    }
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
