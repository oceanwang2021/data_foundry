package com.huatai.datafoundry.backend.task.application.service;

import com.huatai.datafoundry.backend.task.application.command.SchedulerExecutionCallbackCommand;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskStatus;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskExecutionDomainService;
import com.huatai.datafoundry.backend.task.application.service.CollectionResultAppService.ProcessingOutcome;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskExecutionCallbackAppService {
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final TaskExecutionDomainService taskExecutionDomainService;
  private final CollectionResultAppService collectionResultAppService;

  public TaskExecutionCallbackAppService(
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskExecutionDomainService taskExecutionDomainService,
      CollectionResultAppService collectionResultAppService) {
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskExecutionDomainService = taskExecutionDomainService;
    this.collectionResultAppService = collectionResultAppService;
  }

  @Transactional
  public Map<String, Object> applyCallback(SchedulerExecutionCallbackCommand command) {
    if (command == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid callback");
    }
    String callbackStatus = command.getStatus();

    if (command.getTaskGroupId() != null && command.getTaskGroupId().trim().length() > 0) {
      TaskGroup tg = taskGroupRepository.getById(command.getTaskGroupId().trim());
      if (tg == null) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TaskGroup not found");
      }
      String merged = taskExecutionDomainService.mergeStatusOnCallback(tg.getStatus(), callbackStatus);
      if (merged != null) {
        taskGroupRepository.updateStatus(tg.getId(), merged);
      }
    }

    if (command.getTaskId() != null && command.getTaskId().trim().length() > 0) {
      FetchTask task = fetchTaskRepository.getById(command.getTaskId().trim());
      if (task == null) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
      }

      String effectiveCallbackStatus = callbackStatus;
      java.math.BigDecimal confidence = null;
      if (command.getAgentResult() != null && collectionResultAppService != null) {
        ProcessingOutcome outcome = collectionResultAppService.storeAndApply(task, command);
        effectiveCallbackStatus = outcome.getTaskStatus();
        confidence = outcome.getConfidence();
      }

      String merged = taskExecutionDomainService.mergeStatusOnCallback(task.getStatus(), effectiveCallbackStatus);
      if (merged != null) {
        if (confidence != null) {
          fetchTaskRepository.updateStatusAndConfidence(task.getId(), merged, confidence);
        } else {
          fetchTaskRepository.updateStatus(task.getId(), merged);
        }
      }
      recalculateTaskGroup(command.getTaskGroupId(), task.getTaskGroupId());
    }

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  private void recalculateTaskGroup(String callbackTaskGroupId, String taskTaskGroupId) {
    String taskGroupId =
        callbackTaskGroupId != null && callbackTaskGroupId.trim().length() > 0
            ? callbackTaskGroupId.trim()
            : taskTaskGroupId;
    if (taskGroupId == null || taskGroupId.trim().isEmpty()) {
      return;
    }
    TaskGroup tg = taskGroupRepository.getById(taskGroupId);
    if (tg == null) {
      return;
    }
    List<FetchTask> tasks = fetchTaskRepository.listByTaskGroup(taskGroupId);
    if (tasks == null || tasks.isEmpty()) {
      return;
    }
    int completed = 0;
    int failed = 0;
    int running = 0;
    int pending = 0;
    int invalidated = 0;
    for (FetchTask task : tasks) {
      String status = task != null ? task.getStatus() : null;
      if (TaskStatus.COMPLETED.equalsIgnoreCase(status)) {
        completed++;
      } else if (TaskStatus.FAILED.equalsIgnoreCase(status)) {
        failed++;
      } else if (TaskStatus.RUNNING.equalsIgnoreCase(status)) {
        running++;
      } else if (TaskStatus.INVALIDATED.equalsIgnoreCase(status)) {
        invalidated++;
      } else {
        pending++;
      }
    }
    int total = Math.max(tg.getTotalTasks() != null ? tg.getTotalTasks().intValue() : 0, tasks.size());
    String status = resolveTaskGroupStatus(total, completed, failed, running, pending, invalidated);
    tg.setTotalTasks(total);
    tg.setCompletedTasks(completed);
    tg.setFailedTasks(failed);
    tg.setStatus(status);
    taskGroupRepository.upsert(tg);
  }

  private String resolveTaskGroupStatus(
      int total,
      int completed,
      int failed,
      int running,
      int pending,
      int invalidated) {
    if (invalidated >= total && total > 0) {
      return TaskStatus.INVALIDATED;
    }
    if (running > 0) {
      return TaskStatus.RUNNING;
    }
    if (pending > 0) {
      return completed > 0 || failed > 0 ? TaskStatus.RUNNING : TaskStatus.PENDING;
    }
    if (failed > 0) {
      return completed > 0 ? "partial" : "partial";
    }
    return TaskStatus.COMPLETED;
  }
}

