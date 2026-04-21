package com.huatai.datafoundry.backend.task.domain.service;

import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.DimensionRange;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.FetchTaskDraft;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.IndicatorGroup;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.PlanFetchTasksInput;
import java.util.Arrays;
import java.util.Collections;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

public class TaskPlanDomainServiceTest {

  @Test
  void planFetchTasksSelectsIndicatorGroupByPartitionKey() {
    TaskPlanDomainService svc = new TaskPlanDomainService();

    IndicatorGroup ig1 = new IndicatorGroup();
    ig1.id = "ig1";
    ig1.name = "g1";
    ig1.indicatorColumns = Arrays.asList("a", "b");

    IndicatorGroup ig2 = new IndicatorGroup();
    ig2.id = "ig2";
    ig2.name = "g2";
    ig2.indicatorColumns = Arrays.asList("c");

    PlanFetchTasksInput input = new PlanFetchTasksInput();
    input.taskGroupId = "TG1";
    input.businessDate = "2026-01";
    input.planVersion = 1;
    input.schemaVersion = 3;
    input.partitionKey = "ig2";
    input.indicatorGroups = Arrays.asList(ig1, ig2);
    input.dimensions = Collections.singletonList(new DimensionRange("city", Arrays.asList("sh", "bj")));

    java.util.List<FetchTaskDraft> drafts = svc.planFetchTasks(input);
    assertEquals(2, drafts.size());
    assertEquals("ig2", drafts.get(0).indicatorGroupId);
    assertEquals("ft_TG1_ig2_1", drafts.get(0).id);
  }

  @Test
  void planFetchTasksBuildsRowBindingKeyStableOrdering() {
    TaskPlanDomainService svc = new TaskPlanDomainService();

    IndicatorGroup ig = new IndicatorGroup();
    ig.id = "ig";
    ig.name = "g";
    ig.indicatorColumns = Arrays.asList("k1");

    PlanFetchTasksInput input = new PlanFetchTasksInput();
    input.taskGroupId = "TG2";
    input.businessDate = "2026-01";
    input.planVersion = 1;
    input.schemaVersion = 1;
    input.partitionKey = null;
    input.indicatorGroups = Collections.singletonList(ig);
    input.dimensions =
        Arrays.asList(
            new DimensionRange("b", Collections.singletonList("2")),
            new DimensionRange("a", Collections.singletonList("1")));

    java.util.List<FetchTaskDraft> drafts = svc.planFetchTasks(input);
    assertFalse(drafts.isEmpty());
    assertEquals("2026-01::a=1|b=2", drafts.get(0).rowBindingKey);
  }
}

