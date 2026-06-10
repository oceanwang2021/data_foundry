package com.huatai.datafoundry.backend.task.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;
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
  void scheduledTaskGroupGeneratesOnlyBoundIndicatorGroup() {
    WideTableReadRepository wideTableRepository = Mockito.mock(WideTableReadRepository.class);
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    FetchTaskRepository fetchTaskRepository = Mockito.mock(FetchTaskRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            wideTableRepository,
            taskGroupRepository,
            fetchTaskRepository,
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    WideTablePlanSource wideTable = new WideTablePlanSource();
    wideTable.setId("WT1");
    wideTable.setRequirementId("R1");
    wideTable.setSchemaVersion(1);
    wideTable.setScopeJson("{}");
    wideTable.setIndicatorGroupsJson(
        "[{\"id\":\"ig-1\",\"name\":\"Group 1\",\"indicator_columns\":[\"a\"]},"
            + "{\"id\":\"ig-2\",\"name\":\"Group 2\",\"indicator_columns\":[\"b\"]}]");
    when(wideTableRepository.getByIdForRequirement("R1", "WT1")).thenReturn(wideTable);
    when(fetchTaskRepository.listByTaskGroup("TG1"))
        .thenReturn(Collections.<FetchTask>emptyList());

    TaskGroup taskGroup = new TaskGroup();
    taskGroup.setId("TG1");
    taskGroup.setRequirementId("R1");
    taskGroup.setWideTableId("WT1");
    taskGroup.setBatchId("TG1");
    taskGroup.setBusinessDate("2026-05");
    taskGroup.setIndicatorGroupId("ig-2");
    taskGroup.setPlanVersion(1);

    svc.ensureFetchTasksForScheduledTaskGroup(taskGroup);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<List<FetchTask>> captor = ArgumentCaptor.forClass((Class) List.class);
    verify(fetchTaskRepository).upsertBatch(captor.capture());
    assertEquals(1, captor.getValue().size());
    assertEquals("ig-2", captor.getValue().get(0).getIndicatorGroupId());
    assertEquals("ig-2", taskGroup.getPartitionKey());
    assertEquals("Group 2", taskGroup.getPartitionLabel());
  }

  @Test
  void scheduledTaskGroupRejectsUnknownIndicatorGroup() {
    WideTableReadRepository wideTableRepository = Mockito.mock(WideTableReadRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            wideTableRepository,
            Mockito.mock(TaskGroupRepository.class),
            Mockito.mock(FetchTaskRepository.class),
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    WideTablePlanSource wideTable = new WideTablePlanSource();
    wideTable.setId("WT1");
    wideTable.setRequirementId("R1");
    wideTable.setScopeJson("{}");
    wideTable.setIndicatorGroupsJson("[{\"id\":\"ig-1\",\"name\":\"Group 1\"}]");
    when(wideTableRepository.getByIdForRequirement("R1", "WT1")).thenReturn(wideTable);

    TaskGroup taskGroup = new TaskGroup();
    taskGroup.setId("TG1");
    taskGroup.setRequirementId("R1");
    taskGroup.setWideTableId("WT1");
    taskGroup.setIndicatorGroupId("ig-missing");

    ResponseStatusException ex =
        assertThrows(
            ResponseStatusException.class,
            () -> svc.ensureFetchTasksForScheduledTaskGroup(taskGroup));
    assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
  }

  @Test
  void weeklyScheduledTaskMatchesConcreteDateAndRendersIsoWeek() {
    WideTableReadRepository wideTableRepository = Mockito.mock(WideTableReadRepository.class);
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    FetchTaskRepository fetchTaskRepository = Mockito.mock(FetchTaskRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            wideTableRepository,
            taskGroupRepository,
            fetchTaskRepository,
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    WideTablePlanSource wideTable = new WideTablePlanSource();
    wideTable.setId("WT_WEEK");
    wideTable.setRequirementId("R_WEEK");
    wideTable.setSchemaVersion(1);
    wideTable.setScopeJson(
        "{\"business_date\":{\"frequency\":\"WEEKLY\"},"
            + "\"parameter_rows\":["
            + "{\"row_id\":1,\"business_date\":\"2026-06-09\",\"values\":{\"city\":\"sh\"}},"
            + "{\"row_id\":2,\"business_date\":\"2026-06-16\",\"values\":{\"city\":\"bj\"}}]}");
    wideTable.setIndicatorGroupsJson(
        "[{\"id\":\"ig-week\",\"name\":\"Weekly Group\","
            + "\"indicator_columns\":[\"a\"],"
            + "\"prompt_template\":\"Collect {business_date} {city}\"}]");
    when(wideTableRepository.getByIdForRequirement("R_WEEK", "WT_WEEK"))
        .thenReturn(wideTable);
    when(fetchTaskRepository.listByTaskGroup("TG_WEEK"))
        .thenReturn(Collections.<FetchTask>emptyList());

    TaskGroup taskGroup = new TaskGroup();
    taskGroup.setId("TG_WEEK");
    taskGroup.setRequirementId("R_WEEK");
    taskGroup.setWideTableId("WT_WEEK");
    taskGroup.setBatchId("TG_WEEK");
    taskGroup.setBusinessDate("2026-W24");
    taskGroup.setIndicatorGroupId("ig-week");
    taskGroup.setPlanVersion(1);

    svc.ensureFetchTasksForScheduledTaskGroup(taskGroup);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<List<FetchTask>> captor = ArgumentCaptor.forClass((Class) List.class);
    verify(fetchTaskRepository).upsertBatch(captor.capture());
    assertEquals(1, captor.getValue().size());
    assertEquals("2026-W24", captor.getValue().get(0).getBusinessDate());
    assertEquals(
        "Collect 2026-W24 sh",
        captor.getValue().get(0).getRenderedPromptText());
  }

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
  void persistPlanGeneratesFetchTasksImmediately() {
    WideTableReadRepository wideTableRepository = Mockito.mock(WideTableReadRepository.class);
    TaskGroupRepository taskGroupRepository = Mockito.mock(TaskGroupRepository.class);
    FetchTaskRepository fetchTaskRepository = Mockito.mock(FetchTaskRepository.class);
    TaskPlanAppService svc =
        new TaskPlanAppService(
            wideTableRepository,
            taskGroupRepository,
            fetchTaskRepository,
            new TaskPlanDomainService(),
            null,
            new ObjectMapper());

    WideTablePlanSource wideTable = new WideTablePlanSource();
    wideTable.setId("WT1");
    wideTable.setRequirementId("R1");
    wideTable.setSchemaVersion(1);
    wideTable.setScopeJson("{}");
    wideTable.setIndicatorGroupsJson(
        "[{\"id\":\"ig-1\",\"name\":\"Group 1\",\"indicator_columns\":[\"a\"]}]");
    when(wideTableRepository.getByIdForRequirement("R1", "WT1")).thenReturn(wideTable);
    when(taskGroupRepository.listByIds(anyList())).thenReturn(Collections.<TaskGroup>emptyList());
    when(fetchTaskRepository.listByTaskGroup("TG1"))
        .thenReturn(Collections.<FetchTask>emptyList());

    Map<String, Object> raw = new HashMap<String, Object>();
    raw.put("id", "TG1");
    raw.put("business_date", "2026-06");
    raw.put("partition_type", "indicator_group");
    raw.put("partition_key", "ig-1");
    raw.put("status", "pending");
    raw.put("plan_version", 1);

    svc.persistPlanTaskGroups("R1", "WT1", Collections.singletonList(raw));

    @SuppressWarnings("unchecked")
    ArgumentCaptor<List<FetchTask>> captor = ArgumentCaptor.forClass((Class) List.class);
    verify(fetchTaskRepository).upsertBatch(captor.capture());
    assertEquals(1, captor.getValue().size());
    assertEquals("TG1", captor.getValue().get(0).getTaskGroupId());
    assertEquals("ig-1", captor.getValue().get(0).getIndicatorGroupId());
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
