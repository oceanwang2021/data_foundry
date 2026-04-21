package com.huatai.datafoundry.agent.agent.interfaces.web;

import com.huatai.datafoundry.agent.agent.application.service.MockAgentService;
import com.huatai.datafoundry.contract.agent.AgentExecutionRequest;
import com.huatai.datafoundry.contract.agent.AgentExecutionResponse;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/agent")
public class AgentExecutionController {
  private static final long IDEMPOTENCY_TTL_MS = 15 * 60 * 1000L;
  private static final ConcurrentHashMap<String, CachedResponse> IDEMPOTENT_CACHE =
      new ConcurrentHashMap<String, CachedResponse>();
  private final MockAgentService mockAgentService;

  public AgentExecutionController(MockAgentService mockAgentService) {
    this.mockAgentService = mockAgentService;
  }

  @PostMapping("/executions")
  public AgentExecutionResponse execute(
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody AgentExecutionRequest request) {
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid agent request");
    }

    if (idempotencyKey == null || idempotencyKey.trim().isEmpty()) {
      return mockAgentService.execute(request);
    }

    cleanupExpired();
    String key = idempotencyKey.trim();
    CachedResponse cached = IDEMPOTENT_CACHE.get(key);
    if (cached != null && !cached.isExpired()) {
      return cached.response;
    }

    AgentExecutionResponse response = mockAgentService.execute(request);
    IDEMPOTENT_CACHE.put(key, new CachedResponse(response, System.currentTimeMillis() + IDEMPOTENCY_TTL_MS));
    return response;
  }

  private static void cleanupExpired() {
    long now = System.currentTimeMillis();
    if (IDEMPOTENT_CACHE.size() < 200) return;
    Iterator<Map.Entry<String, CachedResponse>> it = IDEMPOTENT_CACHE.entrySet().iterator();
    while (it.hasNext()) {
      Map.Entry<String, CachedResponse> entry = it.next();
      CachedResponse value = entry.getValue();
      if (value == null || value.expiresAtMs <= now) {
        it.remove();
      }
    }
  }

  private static class CachedResponse {
    private final AgentExecutionResponse response;
    private final long expiresAtMs;

    private CachedResponse(AgentExecutionResponse response, long expiresAtMs) {
      this.response = response;
      this.expiresAtMs = expiresAtMs;
    }

    private boolean isExpired() {
      return expiresAtMs <= System.currentTimeMillis();
    }
  }
}
