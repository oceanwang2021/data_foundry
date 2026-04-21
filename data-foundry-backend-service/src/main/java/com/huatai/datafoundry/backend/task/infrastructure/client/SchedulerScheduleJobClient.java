package com.huatai.datafoundry.backend.task.infrastructure.client;

import com.huatai.datafoundry.backend.task.domain.gateway.ScheduleJobGateway;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJob;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJobCreateCommand;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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

@Component
public class SchedulerScheduleJobClient implements ScheduleJobGateway {
  private final RestTemplate restTemplate;
  private final String schedulerBaseUrl;

  public SchedulerScheduleJobClient(
      @Qualifier("schedulerRestTemplate") RestTemplate restTemplate,
      @Value("${data-foundry.scheduler.base-url:http://127.0.0.1:8200}") String schedulerBaseUrl) {
    this.restTemplate = restTemplate;
    this.schedulerBaseUrl = schedulerBaseUrl;
  }

  @Override
  public List<ScheduleJob> list(String triggerType, String status) {
    StringBuilder url = new StringBuilder(schedulerBaseUrl).append("/api/schedule-jobs");
    boolean hasQuery = false;
    if (triggerType != null && triggerType.trim().length() > 0) {
      url.append(hasQuery ? "&" : "?").append("trigger_type=").append(triggerType.trim());
      hasQuery = true;
    }
    if (status != null && status.trim().length() > 0) {
      url.append(hasQuery ? "&" : "?").append("status=").append(status.trim());
    }

    com.huatai.datafoundry.contract.scheduler.ScheduleJob[] jobs;
    try {
      jobs =
          withRetry(
              () ->
                  restTemplate.getForObject(
                      URI.create(url.toString()), com.huatai.datafoundry.contract.scheduler.ScheduleJob[].class));
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable", ex);
    }

    List<ScheduleJob> out = new ArrayList<ScheduleJob>();
    if (jobs == null) return out;
    for (com.huatai.datafoundry.contract.scheduler.ScheduleJob job : jobs) {
      out.add(toDomain(job));
    }
    return out;
  }

  @Override
  public ScheduleJob create(ScheduleJobCreateCommand command, String idempotencyKey) {
    if (command == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid schedule job request");
    }

    Map<String, Object> body = new HashMap<String, Object>();
    body.put("task_group_id", command.getTaskGroupId());
    body.put("task_id", command.getTaskId());
    body.put("trigger_type", command.getTriggerType());
    body.put("operator", command.getOperator());
    body.put("backfill_request_id", command.getBackfillRequestId());

    HttpHeaders headers = new HttpHeaders();
    headers.add("Content-Type", "application/json");
    if (idempotencyKey != null && idempotencyKey.trim().length() > 0) {
      headers.add("X-Idempotency-Key", idempotencyKey.trim());
    }

    try {
      ResponseEntity<com.huatai.datafoundry.contract.scheduler.ScheduleJob> response =
          withRetry(
              () ->
                  restTemplate.exchange(
                      URI.create(schedulerBaseUrl + "/api/schedule-jobs"),
                      HttpMethod.POST,
                      new HttpEntity<Object>(body, headers),
                      com.huatai.datafoundry.contract.scheduler.ScheduleJob.class));
      return toDomain(response.getBody());
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable", ex);
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
      return new ResponseStatusException(status, "Scheduler request rejected" + detail);
    }
    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable" + detail);
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

  private static ScheduleJob toDomain(com.huatai.datafoundry.contract.scheduler.ScheduleJob job) {
    if (job == null) return null;
    ScheduleJob out = new ScheduleJob();
    out.setId(job.getId());
    out.setTaskGroupId(job.getTaskGroupId());
    out.setTaskId(job.getTaskId());
    out.setTriggerType(job.getTriggerType());
    out.setStatus(job.getStatus());
    out.setStartedAt(job.getStartedAt());
    out.setEndedAt(job.getEndedAt());
    out.setOperator(job.getOperator());
    out.setLogRef(job.getLogRef());
    return out;
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
