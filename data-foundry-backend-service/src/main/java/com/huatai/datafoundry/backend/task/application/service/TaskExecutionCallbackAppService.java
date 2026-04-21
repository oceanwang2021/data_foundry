package com.huatai.datafoundry.backend.task.application.service;

import com.huatai.datafoundry.backend.task.application.command.SchedulerExecutionCallbackCommand;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskExecutionDomainService;
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

  public TaskExecutionCallbackAppService(
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskExecutionDomainService taskExecutionDomainService) {
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskExecutionDomainService = taskExecutionDomainService;
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
      String merged = taskExecutionDomainService.mergeStatusOnCallback(task.getStatus(), callbackStatus);
      if (merged != null) {
        fetchTaskRepository.updateStatus(task.getId(), merged);
      }
    }

    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }
}

