package com.huatai.datafoundry.scheduler.schedule.interfaces.web.internal;

import com.huatai.datafoundry.scheduler.schedule.application.service.XxlJobRuleSyncAppService;
import java.util.Collections;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/internal/xxl-job/rules")
public class XxlJobRuleSyncController {
  private final XxlJobRuleSyncAppService syncAppService;
  private final String internalToken;

  public XxlJobRuleSyncController(
      XxlJobRuleSyncAppService syncAppService,
      @Value("${data-foundry.backend.callback-token:}") String internalToken) {
    this.syncAppService = syncAppService;
    this.internalToken = internalToken;
  }

  @PostMapping("/sync")
  public Map<String, Integer> synchronize(
      @RequestHeader(value = "X-Internal-Token", required = false) String requestToken,
      @RequestParam(value = "limit", defaultValue = "50") int limit) {
    assertAuthorized(requestToken);
    int processed = syncAppService.synchronizePending(Math.max(1, Math.min(limit, 500)));
    return Collections.singletonMap("processed", Integer.valueOf(processed));
  }

  private void assertAuthorized(String requestToken) {
    if (internalToken == null || internalToken.trim().isEmpty()) {
      return;
    }
    if (!internalToken.trim().equals(requestToken != null ? requestToken.trim() : "")) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
    }
  }
}
