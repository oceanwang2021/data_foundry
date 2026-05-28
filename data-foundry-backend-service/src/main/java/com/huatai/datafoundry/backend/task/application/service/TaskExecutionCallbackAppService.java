package com.huatai.datafoundry.backend.task.application.service;

import com.huatai.datafoundry.backend.task.application.command.SchedulerExecutionCallbackCommand;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskStatus;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskExecutionDomainService;
import com.huatai.datafoundry.backend.task.application.service.CollectionResultAppService.ProcessingOutcome;
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
  private final TaskGroupAggregateService taskGroupAggregateService;

  public TaskExecutionCallbackAppService(
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskExecutionDomainService taskExecutionDomainService,
      CollectionResultAppService collectionResultAppService,
      TaskGroupAggregateService taskGroupAggregateService) {
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskExecutionDomainService = taskExecutionDomainService;
    this.collectionResultAppService = collectionResultAppService;
    this.taskGroupAggregateService = taskGroupAggregateService;
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
    taskGroupAggregateService.refreshTaskGroup(taskGroupId);
  }
}

