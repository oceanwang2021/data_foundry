package com.huatai.datafoundry.backend.task.application.service;

import com.huatai.datafoundry.backend.task.application.event.TaskExecuteRequestedEvent;
import com.huatai.datafoundry.backend.task.application.event.TaskGroupExecuteRequestedEvent;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskExecutionDomainService;
import com.huatai.datafoundry.backend.task.infrastructure.config.TaskExecutionProperties;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
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

  public TaskAppService(
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskPlanAppService taskPlanAppService,
      TaskExecutionDomainService taskExecutionDomainService,
      TaskExecutionProperties taskExecutionProperties,
      ApplicationEventPublisher eventPublisher) {
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskPlanAppService = taskPlanAppService;
    this.taskExecutionDomainService = taskExecutionDomainService;
    this.taskExecutionProperties = taskExecutionProperties;
    this.eventPublisher = eventPublisher;
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

    String startStatus = taskExecutionDomainService.nextStatusOnStart(tg.getStatus());
    if (startStatus != null) {
      taskGroupRepository.updateStatus(taskGroupId, startStatus);
    }
    if (taskExecutionProperties.isPlaceholderComplete()) {
      // Placeholder: instantly mark as completed (real pipeline comes in M4).
      String completeStatus =
          taskExecutionDomainService.nextStatusOnComplete(startStatus != null ? startStatus : tg.getStatus());
      if (completeStatus != null) {
        taskGroupRepository.updateStatus(taskGroupId, completeStatus);
      }
    }

    String requestId = resolveRequestId(idempotencyKey);
    eventPublisher.publishEvent(new TaskGroupExecuteRequestedEvent(taskGroupId, requestId));

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
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

    String startStatus = taskExecutionDomainService.nextStatusOnStart(task.getStatus());
    if (startStatus != null) {
      fetchTaskRepository.updateStatus(taskId, startStatus);
    }
    if (taskExecutionProperties.isPlaceholderComplete()) {
      String completeStatus =
          taskExecutionDomainService.nextStatusOnComplete(startStatus != null ? startStatus : task.getStatus());
      if (completeStatus != null) {
        fetchTaskRepository.updateStatus(taskId, completeStatus);
      }
    }

    String requestId = resolveRequestId(idempotencyKey);
    eventPublisher.publishEvent(new TaskExecuteRequestedEvent(taskId, requestId));

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
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
      fetchTaskRepository.updateStatus(taskId, next);
    }
    String requestId = resolveRequestId(idempotencyKey);
    eventPublisher.publishEvent(new TaskExecuteRequestedEvent(taskId, requestId));

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  private static String resolveRequestId(String idempotencyKey) {
    if (idempotencyKey == null || idempotencyKey.trim().isEmpty()) {
      return UUID.randomUUID().toString();
    }
    UUID uuid =
        UUID.nameUUIDFromBytes(("req:" + idempotencyKey.trim()).getBytes(StandardCharsets.UTF_8));
    return uuid.toString();
  }
}
