package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.context.ApplicationEventPublisher;

public class TaskAppServiceIdempotencyTest {

  @Test
  void executeTaskGroupUsesStableRequestIdWhenIdempotencyKeyProvided() {
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    FetchTaskRepository fetchTaskRepository = Mockito.mock(FetchTaskRepository.class);
    TaskPlanAppService taskPlanAppService = Mockito.mock(TaskPlanAppService.class);
    ApplicationEventPublisher publisher = Mockito.mock(ApplicationEventPublisher.class);

    TaskGroup tg = new TaskGroup();
    tg.setId("TG1");
    tg.setStatus("pending");
    when(taskGroupRepository.getById("TG1")).thenReturn(tg);

    TaskAppService svc =
        new TaskAppService(
            taskGroupRepository,
            fetchTaskRepository,
            taskPlanAppService,
            new TaskExecutionDomainService(),
            new TaskExecutionProperties(),
            publisher);

    String key = "K-123";
    svc.executeTaskGroup("TG1", new HashMap<String, Object>(), key);

    ArgumentCaptor<TaskGroupExecuteRequestedEvent> captor =
        ArgumentCaptor.forClass(TaskGroupExecuteRequestedEvent.class);
    verify(publisher).publishEvent(captor.capture());

    String expected =
        UUID.nameUUIDFromBytes(("req:" + key).getBytes(StandardCharsets.UTF_8)).toString();
    assertEquals(expected, captor.getValue().getRequestId());
  }

  @Test
  void executeTaskUsesStableRequestIdWhenIdempotencyKeyProvided() {
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    FetchTaskRepository fetchTaskRepository = Mockito.mock(FetchTaskRepository.class);
    TaskPlanAppService taskPlanAppService = Mockito.mock(TaskPlanAppService.class);
    ApplicationEventPublisher publisher = Mockito.mock(ApplicationEventPublisher.class);

    FetchTask task = new FetchTask();
    task.setId("T1");
    task.setStatus("pending");
    when(fetchTaskRepository.getById("T1")).thenReturn(task);
    when(fetchTaskRepository.updateStatus(anyString(), anyString())).thenReturn(1);

    TaskAppService svc =
        new TaskAppService(
            taskGroupRepository,
            fetchTaskRepository,
            taskPlanAppService,
            new TaskExecutionDomainService(),
            new TaskExecutionProperties(),
            publisher);

    String key = "K-456";
    svc.executeTask("T1", key);

    ArgumentCaptor<TaskExecuteRequestedEvent> captor = ArgumentCaptor.forClass(TaskExecuteRequestedEvent.class);
    verify(publisher).publishEvent(captor.capture());

    String expected =
        UUID.nameUUIDFromBytes(("req:" + key).getBytes(StandardCharsets.UTF_8)).toString();
    assertEquals(expected, captor.getValue().getRequestId());
  }
}
