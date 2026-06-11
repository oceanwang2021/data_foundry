package com.huatai.datafoundry.scheduler.schedule.infrastructure.client;

import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
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
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class BackendClient implements BackendGateway {
  private final RestTemplate restTemplate;
  private final String backendBaseUrl;
  private final String callbackToken;

  public BackendClient(
      @Qualifier("backendRestTemplate") RestTemplate restTemplate,
      @Value("${data-foundry.backend.base-url:http://127.0.0.1:8000}") String backendBaseUrl,
      @Value("${data-foundry.backend.callback-token:}") String callbackToken) {
    this.restTemplate = restTemplate;
    this.backendBaseUrl = backendBaseUrl;
    this.callbackToken = callbackToken;
  }

  @Override
  public Map<String, Object> dispatchScheduleRule(
      String ruleId, Object body, String idempotencyKey) {
    if (ruleId == null || ruleId.trim().isEmpty()) {
      throw new IllegalArgumentException("ruleId is required");
    }
    HttpHeaders headers = internalHeaders(idempotencyKey);
    URI uri =
        UriComponentsBuilder.fromHttpUrl(backendBaseUrl)
            .pathSegment("internal", "scheduler", "rules", ruleId.trim(), "dispatch")
            .build()
            .encode()
            .toUri();
    try {
      ResponseEntity<Object> response =
          restTemplate.exchange(
              uri, HttpMethod.POST, new HttpEntity<Object>(body, headers), Object.class);
      if (!response.getStatusCode().is2xxSuccessful()) {
        throw new ResponseStatusException(
            HttpStatus.SERVICE_UNAVAILABLE,
            "Backend schedule dispatch rejected: " + response.getStatusCode());
      }
      if (response.getBody() instanceof Map) {
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) response.getBody();
        return result;
      }
      return new HashMap<String, Object>();
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "Backend service unavailable", ex);
    }
  }

  @Override
  public void callbackExecutionResult(Map<String, Object> body, String idempotencyKey) {
    if (body == null) {
      return;
    }
    HttpHeaders headers = internalHeaders(idempotencyKey);

    try {
      ResponseEntity<Object> response =
          restTemplate.exchange(
              URI.create(backendBaseUrl + "/internal/scheduler/executions/callback"),
              HttpMethod.POST,
              new HttpEntity<Object>(body, headers),
              Object.class);
      if (response.getStatusCode().is2xxSuccessful()) {
        return;
      }
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "Backend callback rejected: " + response.getStatusCode());
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Backend service unavailable", ex);
    }
  }

  @Override
  public Map<String, Object> getFetchTaskPrompt(String taskId, String idempotencyKey) {
    if (taskId == null || taskId.trim().length() == 0) {
      return new HashMap<String, Object>();
    }

    HttpHeaders headers = internalHeaders(idempotencyKey);

    try {
      ResponseEntity<Object> response =
          restTemplate.exchange(
              URI.create(backendBaseUrl + "/internal/scheduler/fetch-tasks/" + taskId.trim() + "/prompt"),
              HttpMethod.GET,
              new HttpEntity<Object>(null, headers),
              Object.class);
      if (!response.getStatusCode().is2xxSuccessful()) {
        throw new ResponseStatusException(
            HttpStatus.SERVICE_UNAVAILABLE, "Backend prompt lookup rejected: " + response.getStatusCode());
      }
      Object body = response.getBody();
      if (body instanceof Map) {
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) body;
        return out;
      }
      return new HashMap<String, Object>();
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Backend service unavailable", ex);
    }
  }

  @Override
  public List<XxlJobRuleSyncCommand> claimPendingXxlJobRules(int limit) {
    URI uri =
        UriComponentsBuilder.fromHttpUrl(backendBaseUrl)
            .pathSegment("internal", "scheduler", "rules", "xxl-sync", "claim")
            .queryParam("limit", limit)
            .build()
            .encode()
            .toUri();
    try {
      ResponseEntity<XxlJobRuleSyncCommand[]> response =
          restTemplate.exchange(
              uri,
              HttpMethod.POST,
              new HttpEntity<Object>(null, internalHeaders(null)),
              XxlJobRuleSyncCommand[].class);
      XxlJobRuleSyncCommand[] body = response.getBody();
      return body == null
          ? Collections.<XxlJobRuleSyncCommand>emptyList()
          : Arrays.asList(body);
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "Backend service unavailable", ex);
    }
  }

  @Override
  public void applyXxlJobRuleSyncResult(XxlJobRuleSyncResult result) {
    URI uri =
        UriComponentsBuilder.fromHttpUrl(backendBaseUrl)
            .pathSegment("internal", "scheduler", "rules", "xxl-sync", "result")
            .build()
            .encode()
            .toUri();
    try {
      restTemplate.exchange(
          uri,
          HttpMethod.POST,
          new HttpEntity<XxlJobRuleSyncResult>(result, internalHeaders(null)),
          Void.class);
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "Backend service unavailable", ex);
    }
  }

  private ResponseStatusException translateDownstream(HttpStatusCodeException ex) {
    HttpStatus status;
    try {
      status = HttpStatus.valueOf(ex.getRawStatusCode());
    } catch (Exception ignored) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
    }
    String responseBody = ex.getResponseBodyAsString();
    String detail =
        responseBody != null && !responseBody.trim().isEmpty()
            ? truncate(responseBody.trim(), 500)
            : ex.getStatusText();
    if (status.is4xxClientError()) {
      return new ResponseStatusException(status, "Backend request rejected: " + detail, ex);
    }
    return new ResponseStatusException(
        HttpStatus.SERVICE_UNAVAILABLE, "Backend service unavailable: " + detail, ex);
  }

  private static String truncate(String value, int maxLength) {
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  private HttpHeaders internalHeaders(String idempotencyKey) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Content-Type", "application/json");
    if (idempotencyKey != null && idempotencyKey.trim().length() > 0) {
      headers.add("X-Idempotency-Key", idempotencyKey.trim());
    }
    if (callbackToken != null && callbackToken.trim().length() > 0) {
      headers.add("X-Internal-Token", callbackToken.trim());
    }
    return headers;
  }
}
