package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableReadRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class TaskPlanAppServiceTest {

  @Test
  void persistPlanDoesNotRegressStatusOrCounters() {
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            Mockito.mock(WideTableReadRepository.class),
            taskGroupRepository,
            Mockito.mock(FetchTaskRepository.class),
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    TaskGroup existing = new TaskGroup();
    existing.setId("TG1");
    existing.setRequirementId("R1");
    existing.setWideTableId("WT1");
    existing.setStatus("completed");
    existing.setCompletedTasks(10);
    existing.setFailedTasks(1);
    existing.setTotalTasks(12);
    existing.setPlanVersion(2);

    when(taskGroupRepository.listByIds(anyList())).thenReturn(Collections.singletonList(existing));

    Map<String, Object> raw = new HashMap<String, Object>();
    raw.put("id", "TG1");
    raw.put("status", "pending");
    raw.put("completed_tasks", 0);
    raw.put("failed_tasks", 0);
    raw.put("total_tasks", 0);
    raw.put("plan_version", 1);

    svc.persistPlanTaskGroups("R1", "WT1", Collections.singletonList(raw));

    @SuppressWarnings("unchecked")
    ArgumentCaptor<List<TaskGroup>> captor = ArgumentCaptor.forClass((Class) List.class);
    verify(taskGroupRepository).upsertBatch(captor.capture());

    TaskGroup merged = captor.getValue().get(0);
    assertEquals("completed", merged.getStatus());
    assertEquals(Integer.valueOf(10), merged.getCompletedTasks());
    assertEquals(Integer.valueOf(1), merged.getFailedTasks());
    assertEquals(Integer.valueOf(12), merged.getTotalTasks());
    assertEquals(Integer.valueOf(2), merged.getPlanVersion());
  }

  @Test
  void persistPlanRejectsCrossAggregateOverwrite() {
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            Mockito.mock(WideTableReadRepository.class),
            taskGroupRepository,
            Mockito.mock(FetchTaskRepository.class),
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    TaskGroup existing = new TaskGroup();
    existing.setId("TG2");
    existing.setRequirementId("R_OTHER");
    existing.setWideTableId("WT1");
    existing.setStatus("pending");

    when(taskGroupRepository.listByIds(anyList())).thenReturn(Arrays.asList(existing));

    Map<String, Object> raw = new HashMap<String, Object>();
    raw.put("id", "TG2");

    ResponseStatusException ex =
        assertThrows(
            ResponseStatusException.class,
            () -> svc.persistPlanTaskGroups("R1", "WT1", Collections.singletonList(raw)));
    assertEquals(HttpStatus.CONFLICT, ex.getStatus());
  }

  @Test
  void persistPlanInvalidateMissingOnlyAffectsPending() {
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            Mockito.mock(WideTableReadRepository.class),
            taskGroupRepository,
            Mockito.mock(FetchTaskRepository.class),
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    when(taskGroupRepository.listByIds(anyList())).thenReturn(Collections.<TaskGroup>emptyList());

    TaskGroup pendingMissing = new TaskGroup();
    pendingMissing.setId("TG_PENDING_MISSING");
    pendingMissing.setRequirementId("R1");
    pendingMissing.setWideTableId("WT1");
    pendingMissing.setStatus("pending");

    TaskGroup runningMissing = new TaskGroup();
    runningMissing.setId("TG_RUNNING_MISSING");
    runningMissing.setRequirementId("R1");
    runningMissing.setWideTableId("WT1");
    runningMissing.setStatus("running");

    when(taskGroupRepository.listByRequirementAndWideTable("R1", "WT1"))
        .thenReturn(Arrays.asList(pendingMissing, runningMissing));

    Map<String, Object> raw = new HashMap<String, Object>();
    raw.put("id", "TG_KEEP");
    raw.put("status", "pending");

    svc.persistPlanTaskGroups("R1", "WT1", Collections.singletonList(raw), true);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<List<String>> captor = ArgumentCaptor.forClass((Class) List.class);
    verify(taskGroupRepository).updateStatusByIds(captor.capture(), anyString());
    assertEquals(1, captor.getValue().size());
    assertEquals("TG_PENDING_MISSING", captor.getValue().get(0));
  }

  @Test
  void persistPlanWithoutInvalidateMissingDoesNotUpdateStatuses() {
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            Mockito.mock(WideTableReadRepository.class),
            taskGroupRepository,
            Mockito.mock(FetchTaskRepository.class),
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    when(taskGroupRepository.listByIds(anyList())).thenReturn(Collections.<TaskGroup>emptyList());

    Map<String, Object> raw = new HashMap<String, Object>();
    raw.put("id", "TG_KEEP");
    raw.put("status", "pending");

    svc.persistPlanTaskGroups("R1", "WT1", Collections.singletonList(raw), false);

    verify(taskGroupRepository, never()).updateStatusByIds(anyList(), anyString());
  }
}
