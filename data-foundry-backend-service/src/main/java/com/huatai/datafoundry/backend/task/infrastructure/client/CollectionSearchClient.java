package com.huatai.datafoundry.backend.task.infrastructure.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.domain.gateway.CollectionSearchGateway;
import java.net.URI;
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

@Component
public class CollectionSearchClient implements CollectionSearchGateway {
  private final RestTemplate restTemplate;
  private final String baseUrl;
  private final ObjectMapper objectMapper;

  public CollectionSearchClient(
      @Qualifier("collectionRestTemplate") RestTemplate restTemplate,
      @Value("${data-foundry.collection.base-url:http://118.196.116.160:3000}") String baseUrl,
      ObjectMapper objectMapper) {
    this.restTemplate = restTemplate;
    this.baseUrl = baseUrl;
    this.objectMapper = objectMapper;
  }

  @Override
  public CollectionSearchResult createSearch(Object requestBody, String idempotencyKey) {
    if (requestBody == null) {
      return new CollectionSearchResult(false, null, "empty request body");
    }

    HttpHeaders headers = new HttpHeaders();
    headers.add("Content-Type", "application/json");
    if (idempotencyKey != null && idempotencyKey.trim().length() > 0) {
      headers.add("X-Idempotency-Key", idempotencyKey.trim());
    }

    try {
      ResponseEntity<Map> response =
          restTemplate.exchange(
              URI.create(baseUrl + "/api/search"),
              HttpMethod.POST,
              new HttpEntity<Object>(requestBody, headers),
              Map.class);

      if (!response.getStatusCode().is2xxSuccessful()) {
        return new CollectionSearchResult(false, null, "non-2xx: " + response.getStatusCode());
      }

      Map raw = response.getBody();
      if (raw == null) {
        return new CollectionSearchResult(false, null, "empty response body");
      }

      Object success = raw.get("success");
      if (!(success instanceof Boolean) || !((Boolean) success).booleanValue()) {
        Object detail = raw.get("detail");
        return new CollectionSearchResult(false, null, detail != null ? String.valueOf(detail) : "success=false");
      }

      Object data = raw.get("data");
      if (!(data instanceof Map)) {
        return new CollectionSearchResult(false, null, "missing data");
      }
      Object taskId = ((Map) data).get("task_id");
      String tid = taskId != null ? String.valueOf(taskId).trim() : "";
      if (tid.isEmpty()) {
        return new CollectionSearchResult(false, null, "missing task_id");
      }
      return new CollectionSearchResult(true, tid, null);
    } catch (HttpStatusCodeException ex) {
      HttpStatus status;
      try {
        status = HttpStatus.valueOf(ex.getRawStatusCode());
      } catch (Exception ignored) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
      String detail = safeSnippet(ex.getResponseBodyAsString());
      return new CollectionSearchResult(false, null, "http " + status.value() + detail);
    } catch (RestClientException ex) {
      return new CollectionSearchResult(false, null, "unavailable: " + ex.getMessage());
    } catch (Exception ex) {
      return new CollectionSearchResult(false, null, ex.getMessage());
    }
  }

  @Override
  public CollectionTaskStatusResult getTaskStatus(String taskId) {
    String normalizedTaskId = normalizeTaskId(taskId);
    if (normalizedTaskId == null) {
      return new CollectionTaskStatusResult(false, null, null, "missing task id");
    }
    try {
      ResponseEntity<String> response =
          restTemplate.exchange(
              URI.create(baseUrl + "/api/task/" + normalizedTaskId + "/status"),
              HttpMethod.GET,
              null,
              String.class);
      return parseTaskStatusResponse(response.getStatusCode(), response.getBody());
    } catch (HttpStatusCodeException ex) {
      HttpStatus status;
      try {
        status = HttpStatus.valueOf(ex.getRawStatusCode());
      } catch (Exception ignored) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
      return new CollectionTaskStatusResult(
          false, normalizedTaskId, null, "http " + status.value() + safeSnippet(ex.getResponseBodyAsString()));
    } catch (RestClientException ex) {
      return new CollectionTaskStatusResult(false, normalizedTaskId, null, "unavailable: " + ex.getMessage());
    } catch (Exception ex) {
      return new CollectionTaskStatusResult(false, normalizedTaskId, null, ex.getMessage());
    }
  }

  @Override
  public CollectionTaskResult getTaskResult(String taskId) {
    String normalizedTaskId = normalizeTaskId(taskId);
    if (normalizedTaskId == null) {
      return new CollectionTaskResult(false, null, null, null, null, "missing task id");
    }
    try {
      ResponseEntity<String> response =
          restTemplate.exchange(
              URI.create(baseUrl + "/api/task/" + normalizedTaskId + "/result"),
              HttpMethod.GET,
              null,
              String.class);
      return parseTaskResultResponse(response.getStatusCode(), response.getBody());
    } catch (HttpStatusCodeException ex) {
      HttpStatus status;
      try {
        status = HttpStatus.valueOf(ex.getRawStatusCode());
      } catch (Exception ignored) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
      return new CollectionTaskResult(
          false,
          normalizedTaskId,
          null,
          null,
          ex.getResponseBodyAsString(),
          "http " + status.value() + safeSnippet(ex.getResponseBodyAsString()));
    } catch (RestClientException ex) {
      return new CollectionTaskResult(
          false, normalizedTaskId, null, null, null, "unavailable: " + ex.getMessage());
    } catch (Exception ex) {
      return new CollectionTaskResult(false, normalizedTaskId, null, null, null, ex.getMessage());
    }
  }

  @Override
  public CollectionTaskCancelResult cancelTask(String taskId) {
    String normalizedTaskId = normalizeTaskId(taskId);
    if (normalizedTaskId == null) {
      return new CollectionTaskCancelResult(false, null, null, "missing task id", 400);
    }
    try {
      ResponseEntity<String> response =
          restTemplate.exchange(
              URI.create(baseUrl + "/api/task/" + normalizedTaskId + "/cancel"),
              HttpMethod.POST,
              null,
              String.class);
      return parseTaskCancelResponse(normalizedTaskId, response.getStatusCode(), response.getBody());
    } catch (HttpStatusCodeException ex) {
      HttpStatus status;
      try {
        status = HttpStatus.valueOf(ex.getRawStatusCode());
      } catch (Exception ignored) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
      String detail = extractErrorDetail(ex.getResponseBodyAsString());
      return new CollectionTaskCancelResult(
          false,
          normalizedTaskId,
          null,
          detail != null ? detail : "http " + status.value() + safeSnippet(ex.getResponseBodyAsString()),
          status.value());
    } catch (RestClientException ex) {
      return new CollectionTaskCancelResult(
          false, normalizedTaskId, null, "unavailable: " + ex.getMessage(), 503);
    } catch (Exception ex) {
      return new CollectionTaskCancelResult(false, normalizedTaskId, null, ex.getMessage(), 500);
    }
  }

  private CollectionTaskStatusResult parseTaskStatusResponse(HttpStatus statusCode, String rawBody) {
    if (statusCode == null || !statusCode.is2xxSuccessful()) {
      return new CollectionTaskStatusResult(false, null, null, "non-2xx: " + statusCode);
    }
    try {
      Map raw = objectMapper.readValue(rawBody, Map.class);
      Object success = raw.get("success");
      if (!(success instanceof Boolean) || !((Boolean) success).booleanValue()) {
        Object detail = raw.get("detail");
        return new CollectionTaskStatusResult(
            false, null, null, detail != null ? String.valueOf(detail) : "success=false");
      }
      Object data = raw.get("data");
      if (!(data instanceof Map)) {
        return new CollectionTaskStatusResult(false, null, null, "missing data");
      }
      Map dataMap = (Map) data;
      String taskId = stringValue(dataMap.get("task_id"));
      String taskStatus = stringValue(dataMap.get("status"));
      if (taskId == null || taskStatus == null) {
        return new CollectionTaskStatusResult(false, taskId, taskStatus, "missing task status");
      }
      return new CollectionTaskStatusResult(true, taskId, taskStatus, null);
    } catch (Exception ex) {
      return new CollectionTaskStatusResult(false, null, null, ex.getMessage());
    }
  }

  private CollectionTaskResult parseTaskResultResponse(HttpStatus statusCode, String rawBody) {
    if (statusCode == null || !statusCode.is2xxSuccessful()) {
      return new CollectionTaskResult(false, null, null, null, rawBody, "non-2xx: " + statusCode);
    }
    try {
      Map raw = objectMapper.readValue(rawBody, Map.class);
      Object success = raw.get("success");
      if (!(success instanceof Boolean) || !((Boolean) success).booleanValue()) {
        Object detail = raw.get("detail");
        return new CollectionTaskResult(
            false,
            null,
            null,
            null,
            rawBody,
            detail != null ? String.valueOf(detail) : "success=false");
      }
      Object data = raw.get("data");
      if (!(data instanceof Map)) {
        return new CollectionTaskResult(false, null, null, null, rawBody, "missing data");
      }
      Map dataMap = (Map) data;
      String taskId = stringValue(dataMap.get("task_id"));
      String taskStatus = stringValue(dataMap.get("status"));
      String finalReport = stringValue(dataMap.get("final_report"));
      return new CollectionTaskResult(true, taskId, taskStatus, finalReport, rawBody, null);
    } catch (Exception ex) {
      return new CollectionTaskResult(false, null, null, null, rawBody, ex.getMessage());
    }
  }

  private CollectionTaskCancelResult parseTaskCancelResponse(
      String requestedTaskId, HttpStatus statusCode, String rawBody) {
    if (statusCode == null || !statusCode.is2xxSuccessful()) {
      return new CollectionTaskCancelResult(
          false, requestedTaskId, null, "non-2xx: " + statusCode, statusCode != null ? statusCode.value() : 500);
    }
    try {
      Map raw = objectMapper.readValue(rawBody, Map.class);
      Object success = raw.get("success");
      if (!(success instanceof Boolean) || !((Boolean) success).booleanValue()) {
        Object detail = raw.get("detail");
        return new CollectionTaskCancelResult(
            false,
            requestedTaskId,
            null,
            detail != null ? String.valueOf(detail) : "success=false",
            statusCode.value());
      }
      Object data = raw.get("data");
      String message = null;
      String taskId = requestedTaskId;
      if (data instanceof Map) {
        Map dataMap = (Map) data;
        String returnedTaskId = stringValue(dataMap.get("task_id"));
        if (returnedTaskId != null) {
          taskId = returnedTaskId;
        }
        message = stringValue(dataMap.get("message"));
      }
      return new CollectionTaskCancelResult(true, taskId, message, null, statusCode.value());
    } catch (Exception ex) {
      return new CollectionTaskCancelResult(false, requestedTaskId, null, ex.getMessage(), statusCode.value());
    }
  }

  private String extractErrorDetail(String rawBody) {
    if (rawBody == null || rawBody.trim().isEmpty()) {
      return null;
    }
    try {
      Map raw = objectMapper.readValue(rawBody, Map.class);
      String detail = stringValue(raw.get("detail"));
      if (detail != null) {
        return detail;
      }
      String message = stringValue(raw.get("message"));
      if (message != null) {
        return message;
      }
      String error = stringValue(raw.get("error"));
      if (error != null) {
        return error;
      }
    } catch (Exception ignored) {
      // fall through to raw snippet
    }
    return null;
  }

  private static String normalizeTaskId(String taskId) {
    if (taskId == null) {
      return null;
    }
    String normalized = taskId.trim();
    return normalized.length() > 0 ? normalized : null;
  }

  private static String stringValue(Object raw) {
    if (raw == null) {
      return null;
    }
    String value = String.valueOf(raw).trim();
    return value.length() > 0 ? value : null;
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
}
