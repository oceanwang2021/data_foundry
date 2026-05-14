package com.huatai.datafoundry.scheduler.schedule.application.handler;

import com.huatai.datafoundry.contract.agent.AgentExecutionRequest;
import com.huatai.datafoundry.contract.agent.AgentExecutionResponse;
import com.huatai.datafoundry.scheduler.schedule.application.event.ScheduleJobCreatedEvent;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.AgentGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.domain.repository.ScheduleJobRepository;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ScheduleJobCreatedHandler {
  private static final Logger log = LoggerFactory.getLogger(ScheduleJobCreatedHandler.class);
  private final ScheduleJobRepository scheduleJobRepository;
  private final AgentGateway agentGateway;
  private final BackendGateway backendGateway;

  public ScheduleJobCreatedHandler(
      ScheduleJobRepository scheduleJobRepository,
      AgentGateway agentGateway,
      BackendGateway backendGateway) {
    this.scheduleJobRepository = scheduleJobRepository;
    this.agentGateway = agentGateway;
    this.backendGateway = backendGateway;
  }

  @Transactional
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onCreated(ScheduleJobCreatedEvent event) {
    if (event == null || event.getJobId() == null) return;
    String jobId = event.getJobId();
    ScheduleJob record = scheduleJobRepository.get(jobId);
    if (record == null) return;

    try {
      AgentExecutionRequest req = new AgentExecutionRequest();
      String taskId = record.getTaskId() != null ? record.getTaskId() : record.getTaskGroupId();
      req.setTaskId(taskId);
      req.setRunId(jobId);
      req.setTaskGroupId(record.getTaskGroupId());
      req.setExecutionMode("normal");
      if (record.getTaskId() != null && record.getTaskId().trim().length() > 0) {
        try {
          Map<String, Object> prompt =
              backendGateway.getFetchTaskPrompt(record.getTaskId().trim(), "schedule-job-prompt:" + jobId);
          Object rendered = prompt != null ? prompt.get("rendered_prompt_text") : null;
          if (rendered != null) {
            String text = String.valueOf(rendered);
            if (text != null && text.trim().length() > 0) {
              req.setPromptTemplate(text);
            }
          }
        } catch (Exception ex) {
          log.debug("Backend prompt lookup failed for task {}: {}", record.getTaskId(), ex.getMessage());
        }
      }

      AgentExecutionResponse resp = agentGateway.execute(req, "schedule-job:" + jobId);
      String endedAt = Instant.now().toString();
      String status = resp != null && "completed".equalsIgnoreCase(resp.getStatus()) ? "completed" : "failed";
      scheduleJobRepository.updateStatus(jobId, status, endedAt, record.getLogRef());

      callbackBackend(record, status, endedAt);
    } catch (Exception ex) {
      log.warn("Agent execution failed for job {}: {}", jobId, ex.getMessage());
      String endedAt = Instant.now().toString();
      scheduleJobRepository.updateStatus(jobId, "failed", endedAt, record.getLogRef());
      try {
        callbackBackend(record, "failed", endedAt);
      } catch (Exception ignored) {
        // best-effort
      }
    }
  }

  private void callbackBackend(ScheduleJob record, String status, String endedAt) {
    if (record == null) return;
    Map<String, Object> body = new HashMap<String, Object>();
    body.put("schedule_job_id", record.getId());
    body.put("task_group_id", record.getTaskGroupId());
    body.put("task_id", record.getTaskId());
    body.put("status", status);
    body.put("ended_at", endedAt);

    String idem = "schedule-job-callback:" + record.getId();
    try {
      backendGateway.callbackExecutionResult(body, idem);
    } catch (Exception ex) {
      log.warn("Backend callback failed for job {}: {}", record.getId(), ex.getMessage());
    }
  }
}
