package com.huatai.datafoundry.backend.task.application.handler;

import com.huatai.datafoundry.backend.task.application.event.TaskExecuteRequestedEvent;
import com.huatai.datafoundry.backend.task.application.event.TaskGroupExecuteRequestedEvent;
import com.huatai.datafoundry.backend.task.application.service.ScheduleJobFacadeAppService;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJobCreateCommand;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * After local commit, trigger scheduler execution via gateway (best-effort).
 */
@Component
public class TaskExecutionAfterCommitHandler {
  private static final Logger log = LoggerFactory.getLogger(TaskExecutionAfterCommitHandler.class);
  private final ScheduleJobFacadeAppService scheduleJobFacadeAppService;

  public TaskExecutionAfterCommitHandler(ScheduleJobFacadeAppService scheduleJobFacadeAppService) {
    this.scheduleJobFacadeAppService = scheduleJobFacadeAppService;
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onTaskGroupExecuteRequested(TaskGroupExecuteRequestedEvent event) {
    if (event == null || event.getTaskGroupId() == null) return;
    String taskGroupId = event.getTaskGroupId();
    String requestId = event.getRequestId();
    String idempotencyKey =
        requestId == null || requestId.trim().isEmpty()
            ? "task-group-execute:" + taskGroupId
            : "task-group-execute:" + taskGroupId + ":" + requestId.trim();

    ScheduleJobCreateCommand command = new ScheduleJobCreateCommand();
    command.setTaskGroupId(taskGroupId);
    command.setTriggerType("manual");
    command.setOperator("system");
    try {
      scheduleJobFacadeAppService.createWithIdempotency(command, idempotencyKey);
    } catch (Exception ex) {
      log.warn("Failed to create schedule job for taskGroup {}: {}", taskGroupId, ex.getMessage());
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onTaskExecuteRequested(TaskExecuteRequestedEvent event) {
    if (event == null || event.getTaskId() == null) return;
    String taskId = event.getTaskId();
    String requestId = event.getRequestId();
    String idempotencyKey =
        requestId == null || requestId.trim().isEmpty()
            ? "task-execute:" + taskId
            : "task-execute:" + taskId + ":" + requestId.trim();

    ScheduleJobCreateCommand command = new ScheduleJobCreateCommand();
    command.setTaskId(taskId);
    command.setTriggerType("manual");
    command.setOperator("system");
    try {
      scheduleJobFacadeAppService.createWithIdempotency(command, idempotencyKey);
    } catch (Exception ex) {
      log.warn("Failed to create schedule job for task {}: {}", taskId, ex.getMessage());
    }
  }
}
