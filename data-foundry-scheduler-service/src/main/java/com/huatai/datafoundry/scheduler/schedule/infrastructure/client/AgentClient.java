package com.huatai.datafoundry.scheduler.schedule.infrastructure.client;

import com.huatai.datafoundry.contract.agent.AgentExecutionRequest;
import com.huatai.datafoundry.contract.agent.AgentExecutionResponse;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.AgentGateway;
import java.net.URI;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AgentClient implements AgentGateway {
  private final RestTemplate restTemplate;
  private final String agentBaseUrl;

  public AgentClient(
      @Qualifier("agentRestTemplate") RestTemplate restTemplate,
      @Value("${data-foundry.agent.base-url:http://127.0.0.1:8100}") String agentBaseUrl) {
    this.restTemplate = restTemplate;
    this.agentBaseUrl = agentBaseUrl;
  }

  @Override
  public AgentExecutionResponse execute(AgentExecutionRequest request, String idempotencyKey) {
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid agent request");
    }

    HttpHeaders headers = new HttpHeaders();
    headers.add("Content-Type", "application/json");
    if (idempotencyKey != null && idempotencyKey.trim().length() > 0) {
      headers.add("X-Idempotency-Key", idempotencyKey.trim());
    }

    try {
      ResponseEntity<AgentExecutionResponse> response =
          withRetry(
              () ->
                  restTemplate.exchange(
                      URI.create(agentBaseUrl + "/agent/executions"),
                      HttpMethod.POST,
                      new HttpEntity<AgentExecutionRequest>(request, headers),
                      AgentExecutionResponse.class));
      return response.getBody();
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Agent service unavailable", ex);
    }
  }

  private ResponseStatusException translateDownstream(HttpStatusCodeException ex) {
    HttpStatus status;
    try {
      status = HttpStatus.valueOf(ex.getRawStatusCode());
    } catch (Exception ignored) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
    }
    String detail = safeSnippet(ex.getResponseBodyAsString());
    if (status.is4xxClientError()) {
      return new ResponseStatusException(status, "Agent request rejected" + detail);
    }
    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Agent service unavailable" + detail);
  }

  private static String safeSnippet(String raw) {
    if (raw == null) return "";
    String s = raw.trim();
    if (s.isEmpty()) return "";
    if (s.length() > 200) {
      s = s.substring(0, 200) + "...";
    }
    return " (downstream=" + s + ")";
  }

  private static <T> T withRetry(RetryableSupplier<T> supplier) {
    int attempts = 0;
    while (true) {
      attempts++;
      try {
        return supplier.get();
      } catch (RestClientException ex) {
        if (attempts >= 3) {
          throw ex;
        }
        sleepQuietly(attempts == 1 ? 100 : 300);
      }
    }
  }

  private static void sleepQuietly(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException ignored) {
      Thread.currentThread().interrupt();
    }
  }

  private interface RetryableSupplier<T> {
    T get();
  }
}
