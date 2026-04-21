package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.backend.task.application.command.SchedulerExecutionCallbackCommand;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskExecutionDomainService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

public class TaskExecutionCallbackAppServiceTest {

  @Test
  void callbackDoesNotRegressCompletedToFailed() {
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    FetchTaskRepository fetchTaskRepository = Mockito.mock(FetchTaskRepository.class);

    TaskGroup tg = new TaskGroup();
    tg.setId("TG1");
    tg.setStatus("completed");
    when(taskGroupRepository.getById("TG1")).thenReturn(tg);

    TaskExecutionCallbackAppService svc =
        new TaskExecutionCallbackAppService(
            taskGroupRepository, fetchTaskRepository, new TaskExecutionDomainService());

    SchedulerExecutionCallbackCommand cmd = new SchedulerExecutionCallbackCommand();
    cmd.setTaskGroupId("TG1");
    cmd.setStatus("failed");

    svc.applyCallback(cmd);

    verify(taskGroupRepository, never()).updateStatus("TG1", "failed");
  }

  @Test
  void callbackAllowsUpgradeFailedToCompleted() {
    FetchTaskRepository fetchTaskRepository = Mockito.mock(FetchTaskRepository.class);
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);

    FetchTask task = new FetchTask();
    task.setId("T1");
    task.setStatus("failed");
    when(fetchTaskRepository.getById("T1")).thenReturn(task);

    TaskExecutionCallbackAppService svc =
        new TaskExecutionCallbackAppService(
            taskGroupRepository, fetchTaskRepository, new TaskExecutionDomainService());

    SchedulerExecutionCallbackCommand cmd = new SchedulerExecutionCallbackCommand();
    cmd.setTaskId("T1");
    cmd.setStatus("completed");

    svc.applyCallback(cmd);

    verify(fetchTaskRepository).updateStatus("T1", "completed");
  }
}

