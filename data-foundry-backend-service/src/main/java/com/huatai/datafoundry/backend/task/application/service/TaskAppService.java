package com.huatai.datafoundry.backend.task.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.application.event.TaskExecuteRequestedEvent;
import com.huatai.datafoundry.backend.task.application.event.TaskGroupExecuteRequestedEvent;
import com.huatai.datafoundry.backend.task.domain.gateway.CollectionSearchGateway;
import com.huatai.datafoundry.backend.task.domain.gateway.CollectionSearchGateway.CollectionSearchResult;
import com.huatai.datafoundry.backend.task.domain.gateway.CollectionSearchGateway.CollectionTaskCancelResult;
import com.huatai.datafoundry.backend.task.domain.gateway.CollectionSearchGateway.CollectionTaskResult;
import com.huatai.datafoundry.backend.task.domain.gateway.CollectionSearchGateway.CollectionTaskStatusResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.model.TaskStatus;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskExecutionDomainService;
import com.huatai.datafoundry.backend.task.infrastructure.config.TaskExecutionProperties;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskAppService {
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final TaskPlanAppService taskPlanAppService;
  private final TaskExecutionDomainService taskExecutionDomainService;
  private final TaskExecutionProperties taskExecutionProperties;
  private final ApplicationEventPublisher eventPublisher;
  private final CollectionSearchGateway collectionSearchGateway;
  private final CollectionResultRepository collectionResultRepository;
  private final ObjectMapper objectMapper;

  public TaskAppService(
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskPlanAppService taskPlanAppService,
      TaskExecutionDomainService taskExecutionDomainService,
      TaskExecutionProperties taskExecutionProperties,
      ApplicationEventPublisher eventPublisher,
      CollectionSearchGateway collectionSearchGateway,
      CollectionResultRepository collectionResultRepository,
      ObjectMapper objectMapper) {
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskPlanAppService = taskPlanAppService;
    this.taskExecutionDomainService = taskExecutionDomainService;
    this.taskExecutionProperties = taskExecutionProperties;
    this.eventPublisher = eventPublisher;
    this.collectionSearchGateway = collectionSearchGateway;
    this.collectionResultRepository = collectionResultRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> executeTaskGroup(
      String taskGroupId, Map<String, Object> body, String idempotencyKey) {
    TaskGroup tg = taskGroupRepository.getById(taskGroupId);
    if (tg == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TaskGroup not found");
    }

    taskExecutionDomainService.assertCanExecuteTaskGroup(tg.getStatus());

    // Ensure tasks exist (lazy generation).
    taskPlanAppService.ensureFetchTasksForTaskGroup(tg);
    List<FetchTask> tasks = fetchTaskRepository.listByTaskGroup(taskGroupId);
    if (tasks == null || tasks.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No fetch tasks available for task group");
    }

    dispatchFetchTasks(tasks, resolveRequestId(idempotencyKey), "task-group");
    refreshTaskGroupAggregates(Collections.singletonList(taskGroupId));

    String requestId = resolveRequestId(idempotencyKey);
    eventPublisher.publishEvent(new TaskGroupExecuteRequestedEvent(taskGroupId, requestId));

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    out.put("task_group_id", taskGroupId);
    out.put("task_count", tasks.size());
    return out;
  }

  @Transactional
  public Map<String, Object> ensureTasks(String taskGroupId) {
    TaskGroup tg = taskGroupRepository.getById(taskGroupId);
    if (tg == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TaskGroup not found");
    }
    taskPlanAppService.ensureFetchTasksForTaskGroup(tg);
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    out.put("task_group_id", taskGroupId);
    out.put("task_count", fetchTaskRepository.countByTaskGroup(taskGroupId));
    return out;
  }

  @Transactional
  public Map<String, Object> executeTask(String taskId, String idempotencyKey) {
    FetchTask task = fetchTaskRepository.getById(taskId);
    if (task == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
    }

    taskExecutionDomainService.assertCanExecuteTask(task.getStatus());
    dispatchFetchTasks(Collections.singletonList(task), resolveRequestId(idempotencyKey), "task");
    refreshTaskGroupAggregates(Collections.singletonList(task.getTaskGroupId()));

    String requestId = resolveRequestId(idempotencyKey);
    eventPublisher.publishEvent(new TaskExecuteRequestedEvent(taskId, requestId));

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    out.put("task_id", taskId);
    out.put("collection_task_id", task.getCollectionTaskId());
    out.put("status", task.getStatus());
    return out;
  }

  @Transactional
  public Map<String, Object> retryTask(String taskId, String idempotencyKey) {
    FetchTask task = fetchTaskRepository.getById(taskId);
    if (task == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
    }

    taskExecutionDomainService.assertCanExecuteTask(task.getStatus());

    String next = taskExecutionDomainService.nextStatusOnRetry(task.getStatus());
    if (next != null) {
      task.setStatus(next);
    }
    dispatchFetchTasks(Collections.singletonList(task), resolveRequestId(idempotencyKey), "retry");
    refreshTaskGroupAggregates(Collections.singletonList(task.getTaskGroupId()));
    String requestId = resolveRequestId(idempotencyKey);
    eventPublisher.publishEvent(new TaskExecuteRequestedEvent(taskId, requestId));

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    out.put("task_id", taskId);
    out.put("collection_task_id", task.getCollectionTaskId());
    out.put("status", task.getStatus());
    return out;
  }

  @Transactional
  public Map<String, Object> cancelTask(String collectionTaskIdOrTaskId) {
    String lookupKey = normalize(collectionTaskIdOrTaskId);
    if (lookupKey == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "collectionTaskId is required");
    }

    FetchTask task = fetchTaskRepository.getByCollectionTaskId(lookupKey);
    if (task == null) {
      task = fetchTaskRepository.getById(lookupKey);
    }
    if (task == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
    }

    String currentStatus = normalize(task.getStatus());
    if (!TaskStatus.RUNNING.equals(currentStatus)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Task is not running");
    }

    String externalTaskId = normalize(task.getCollectionTaskId());
    if (externalTaskId == null) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Task has no collection task id");
    }

    CollectionTaskCancelResult result = collectionSearchGateway.cancelTask(externalTaskId);
    if (result == null || !result.isSuccess()) {
      int downstreamStatus = result != null && result.getHttpStatusCode() != null
          ? result.getHttpStatusCode().intValue()
          : HttpStatus.BAD_GATEWAY.value();
      HttpStatus responseStatus;
      try {
        responseStatus = HttpStatus.valueOf(downstreamStatus);
      } catch (Exception ignored) {
        responseStatus = HttpStatus.BAD_GATEWAY;
      }
      throw new ResponseStatusException(
          responseStatus,
          result != null && result.getErrorMessage() != null
              ? result.getErrorMessage()
              : "Failed to cancel collection task");
    }

    fetchTaskRepository.updateStatus(task.getId(), TaskStatus.CANCELLED, externalTaskId);
    task.setStatus(TaskStatus.CANCELLED);
    refreshTaskGroupAggregates(Collections.singletonList(task.getTaskGroupId()));

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    out.put("task_id", task.getId());
    out.put("collection_task_id", externalTaskId);
    out.put("status", TaskStatus.CANCELLED);
    out.put(
        "message",
        result.getMessage() != null && result.getMessage().trim().length() > 0
            ? result.getMessage().trim()
            : "任务已取消");
    return out;
  }

  @Transactional
  public Map<String, Object> syncWideTableCollectionStatuses(String wideTableId) {
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wideTableId is required");
    }
    List<FetchTask> tasks = fetchTaskRepository.listByWideTable(wideTableId.trim());
    SyncSummary summary = syncFetchTasks(tasks);
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    out.put("wide_table_id", wideTableId.trim());
    out.put("synced_task_count", summary.syncedTaskCount);
    out.put("completed_task_count", summary.completedTaskCount);
    out.put("failed_task_count", summary.failedTaskCount);
    out.put("cancelled_task_count", summary.cancelledTaskCount);
    out.put("error_count", summary.errorCount);
    return out;
  }

  private void dispatchFetchTasks(List<FetchTask> fetchTasks, String requestId, String prefix) {
    List<FetchTask> preparedTasks = taskPlanAppService.refreshPromptSnapshotsForCollection(fetchTasks);
    for (FetchTask task : preparedTasks) {
      if (task == null || task.getId() == null) {
        continue;
      }
      Object requestBody = parseRenderedPromptBody(task.getRenderedPromptText());
      if (requestBody == null || collectionSearchGateway == null) {
        fetchTaskRepository.updateStatus(task.getId(), "failed", null);
        task.setStatus("failed");
        task.setCollectionTaskId(null);
        continue;
      }
      CollectionSearchResult result =
          collectionSearchGateway.createSearch(requestBody, prefix + ":" + requestId + ":" + task.getId());
      if (result != null && result.isSuccess() && result.getTaskId() != null) {
        fetchTaskRepository.updateStatus(task.getId(), "running", result.getTaskId());
        task.setStatus("running");
        task.setCollectionTaskId(result.getTaskId());
      } else {
        fetchTaskRepository.updateStatus(task.getId(), "failed", null);
        task.setStatus("failed");
        task.setCollectionTaskId(null);
      }
    }
  }

  private Object parseRenderedPromptBody(String renderedPromptText) {
    if (renderedPromptText == null || renderedPromptText.trim().isEmpty()) {
      return null;
    }
    try {
      return objectMapper.readValue(renderedPromptText, Object.class);
    } catch (Exception ex) {
      return null;
    }
  }

  private SyncSummary syncFetchTasks(List<FetchTask> fetchTasks) {
    SyncSummary summary = new SyncSummary();
    if (fetchTasks == null || fetchTasks.isEmpty() || collectionSearchGateway == null) {
      return summary;
    }
    Set<String> taskGroupIds = new LinkedHashSet<String>();
    for (FetchTask fetchTask : fetchTasks) {
      if (fetchTask == null) {
        continue;
      }
      if (fetchTask.getTaskGroupId() != null) {
        taskGroupIds.add(fetchTask.getTaskGroupId());
      }
      String externalTaskId = normalize(fetchTask.getCollectionTaskId());
      if (externalTaskId == null) {
        continue;
      }
      CollectionTaskStatusResult statusResult = collectionSearchGateway.getTaskStatus(externalTaskId);
      if (statusResult == null || !statusResult.isSuccess()) {
        summary.errorCount++;
        continue;
      }
      String downstreamStatus = mapExternalTaskStatus(statusResult.getStatus());
      String currentStatus = normalize(fetchTask.getStatus());
      String nextStatus = mergeCollectionTaskStatus(currentStatus, downstreamStatus);
      if (nextStatus != null && !nextStatus.equalsIgnoreCase(currentStatus)) {
        fetchTaskRepository.updateStatus(fetchTask.getId(), nextStatus, externalTaskId);
        fetchTask.setStatus(nextStatus);
      }
      summary.syncedTaskCount++;
      if (TaskStatus.COMPLETED.equalsIgnoreCase(nextStatus)) {
        summary.completedTaskCount++;
        upsertCompletedCollectionResult(fetchTask, externalTaskId);
      } else if (TaskStatus.FAILED.equalsIgnoreCase(nextStatus)) {
        summary.failedTaskCount++;
      } else if (TaskStatus.CANCELLED.equalsIgnoreCase(nextStatus)) {
        summary.cancelledTaskCount++;
      }
    }
    refreshTaskGroupAggregates(new ArrayList<String>(taskGroupIds));
    return summary;
  }

  private void upsertCompletedCollectionResult(FetchTask fetchTask, String externalTaskId) {
    if (fetchTask == null || fetchTask.getId() == null || externalTaskId == null) {
      return;
    }
    if (hasCollectionResult(fetchTask.getId(), externalTaskId)) {
      return;
    }
    CollectionTaskResult taskResult = collectionSearchGateway.getTaskResult(externalTaskId);
    if (taskResult == null || !taskResult.isSuccess() || taskResult.getRawResponseJson() == null) {
      return;
    }
    CollectionResult result = new CollectionResult();
    result.setId(buildCollectionResultId(fetchTask.getId(), externalTaskId));
    result.setFetchTaskId(fetchTask.getId());
    result.setExternalTaskId(externalTaskId);
    result.setTaskGroupId(fetchTask.getTaskGroupId());
    result.setBatchId(fetchTask.getBatchId());
    result.setWideTableId(fetchTask.getWideTableId());
    result.setRowId(fetchTask.getRowId());
    result.setRawResultJson(taskResult.getRawResponseJson());
    result.setFinalReport(taskResult.getFinalReport());
    result.setStatus("completed");
    result.setCollectedAt(LocalDateTime.now());
    collectionResultRepository.upsertResult(result);
  }

  private boolean hasCollectionResult(String fetchTaskId, String externalTaskId) {
    List<CollectionResult> existing = collectionResultRepository.listResultsByTask(fetchTaskId);
    if (existing == null || existing.isEmpty()) {
      return false;
    }
    for (CollectionResult collectionResult : existing) {
      if (collectionResult == null) {
        continue;
      }
      String storedExternalTaskId = normalize(collectionResult.getExternalTaskId());
      if (storedExternalTaskId != null && storedExternalTaskId.equals(externalTaskId)) {
        return true;
      }
    }
    return false;
  }

  private void refreshTaskGroupAggregates(List<String> taskGroupIds) {
    if (taskGroupIds == null || taskGroupIds.isEmpty()) {
      return;
    }
    for (String taskGroupId : taskGroupIds) {
      if (taskGroupId == null || taskGroupId.trim().isEmpty()) {
        continue;
      }
      TaskGroup taskGroup = taskGroupRepository.getById(taskGroupId);
      if (taskGroup == null) {
        continue;
      }
      List<FetchTask> tasks = fetchTaskRepository.listByTaskGroup(taskGroupId);
      int total = tasks != null ? tasks.size() : 0;
      int running = 0;
      int completed = 0;
      int failed = 0;
      int cancelled = 0;
      int invalidated = 0;
      if (tasks != null) {
        for (FetchTask task : tasks) {
          String status = normalize(task != null ? task.getStatus() : null);
          if (TaskStatus.RUNNING.equals(status)) {
            running++;
          } else if (TaskStatus.COMPLETED.equals(status)) {
            completed++;
          } else if (TaskStatus.FAILED.equals(status)) {
            failed++;
          } else if (TaskStatus.CANCELLED.equals(status)) {
            cancelled++;
          } else if (TaskStatus.INVALIDATED.equals(status)) {
            invalidated++;
          }
        }
      }
      int pending = Math.max(total - running - completed - failed - cancelled - invalidated, 0);
      taskGroup.setTotalTasks(total);
      taskGroup.setCompletedTasks(completed);
      taskGroup.setFailedTasks(failed);
      taskGroup.setStatus(
          resolveAggregateTaskGroupStatus(pending, running, completed, failed, cancelled, invalidated));
      taskGroupRepository.upsert(taskGroup);
    }
  }

  private String resolveAggregateTaskGroupStatus(
      int pending, int running, int completed, int failed, int cancelled, int invalidated) {
    if (running > 0) {
      return TaskStatus.RUNNING;
    }
    if (pending > 0 && completed == 0 && failed == 0 && cancelled == 0 && invalidated == 0) {
      return TaskStatus.PENDING;
    }
    if (completed > 0 && failed == 0 && cancelled == 0 && pending == 0) {
      return TaskStatus.COMPLETED;
    }
    if (cancelled > 0 && completed == 0 && failed == 0 && pending == 0 && invalidated == 0) {
      return TaskStatus.CANCELLED;
    }
    if (failed > 0 && completed == 0 && cancelled == 0 && pending == 0) {
      return TaskStatus.FAILED;
    }
    if (failed > 0 || completed > 0 || cancelled > 0) {
      return "partial";
    }
    if (invalidated > 0 && pending == 0) {
      return TaskStatus.INVALIDATED;
    }
    return TaskStatus.PENDING;
  }

  private String mapExternalTaskStatus(String rawStatus) {
    String normalized = normalize(rawStatus);
    if (normalized == null) {
      return null;
    }
    if (TaskStatus.PENDING.equals(normalized)
        || TaskStatus.RUNNING.equals(normalized)
        || TaskStatus.COMPLETED.equals(normalized)
        || TaskStatus.FAILED.equals(normalized)
        || TaskStatus.CANCELLED.equals(normalized)) {
      return normalized;
    }
    return null;
  }

  private String mergeCollectionTaskStatus(String currentStatus, String downstreamStatus) {
    if (downstreamStatus == null) {
      return currentStatus;
    }
    if (currentStatus == null) {
      return downstreamStatus;
    }
    return TaskStatus.preferMoreAdvanced(currentStatus, downstreamStatus);
  }

  private static String buildCollectionResultId(String fetchTaskId, String externalTaskId) {
    UUID uuid =
        UUID.nameUUIDFromBytes(("collection-result:" + fetchTaskId + ":" + externalTaskId).getBytes(StandardCharsets.UTF_8));
    return uuid.toString();
  }

  private static String normalize(String raw) {
    if (raw == null) {
      return null;
    }
    String normalized = raw.trim().toLowerCase();
    return normalized.length() > 0 ? normalized : null;
  }

  private static String resolveRequestId(String idempotencyKey) {
    if (idempotencyKey == null || idempotencyKey.trim().isEmpty()) {
      return UUID.randomUUID().toString();
    }
    UUID uuid =
        UUID.nameUUIDFromBytes(("req:" + idempotencyKey.trim()).getBytes(StandardCharsets.UTF_8));
    return uuid.toString();
  }

  private static final class SyncSummary {
    private int syncedTaskCount;
    private int completedTaskCount;
    private int failedTaskCount;
    private int cancelledTaskCount;
    private int errorCount;
  }
}
