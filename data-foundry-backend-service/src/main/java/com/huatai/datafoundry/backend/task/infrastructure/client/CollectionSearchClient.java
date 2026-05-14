package com.huatai.datafoundry.backend.task.infrastructure.client;

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

  public CollectionSearchClient(
      @Qualifier("collectionRestTemplate") RestTemplate restTemplate,
      @Value("${data-foundry.collection.base-url:http://118.196.116.160:3000}") String baseUrl) {
    this.restTemplate = restTemplate;
    this.baseUrl = baseUrl;
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

