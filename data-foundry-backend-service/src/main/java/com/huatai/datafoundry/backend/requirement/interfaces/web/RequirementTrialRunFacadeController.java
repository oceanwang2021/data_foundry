package com.huatai.datafoundry.backend.requirement.interfaces.web;

import com.huatai.datafoundry.backend.requirement.application.command.RequirementTrialRunCommand;
import com.huatai.datafoundry.backend.task.application.service.TaskPlanAppService;
import com.huatai.datafoundry.backend.task.application.service.TaskPlanAppService.TrialRunResult;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/requirements/{requirementId}")
public class RequirementTrialRunFacadeController {
  private final TaskPlanAppService taskPlanAppService;

  public RequirementTrialRunFacadeController(TaskPlanAppService taskPlanAppService) {
    this.taskPlanAppService = taskPlanAppService;
  }

  @PostMapping("/trial-run")
  public Map<String, Object> createTrialRun(
      @PathVariable("requirementId") String requirementId,
      @RequestBody RequirementTrialRunCommand command) {
    TrialRunResult result = taskPlanAppService.createTrialRun(
        requirementId,
        command != null ? command.getWideTableId() : null,
        command != null ? command.getBusinessDates() : null,
        command != null ? command.getRowBindingKeys() : null,
        command != null ? command.getMaxRows() : null,
        command != null ? command.getOperator() : null);

    Map<String, Object> response = new LinkedHashMap<String, Object>();
    response.put("batch", buildBatch(result));
    response.put("task_groups", result.taskGroups.stream().map(this::buildTaskGroup).collect(Collectors.toList()));
    response.put("fetch_tasks", result.fetchTasks.stream().map(this::buildFetchTask).collect(Collectors.toList()));
    response.put("row_count", result.rowCount);
    response.put("task_count", result.taskCount);
    return response;
  }

  private Map<String, Object> buildBatch(TrialRunResult result) {
    Map<String, Object> batch = new LinkedHashMap<String, Object>();
    batch.put("id", result.batchId);
    batch.put("wide_table_id", result.wideTableId);
    batch.put("snapshot_at", result.createdAt);
    batch.put("snapshot_label", "trial");
    batch.put("coverage_mode", result.coverageMode);
    batch.put("semantic_time_axis", result.semanticTimeAxis);
    batch.put("status", "running");
    batch.put("is_current", Boolean.FALSE);
    batch.put("plan_version", result.planVersion);
    batch.put("triggered_by", result.triggeredBy);
    batch.put("start_business_date", result.startBusinessDate);
    batch.put("end_business_date", result.endBusinessDate);
    batch.put("created_at", result.createdAt);
    batch.put("updated_at", result.createdAt);
    return batch;
  }

  private Map<String, Object> buildTaskGroup(TaskGroup taskGroup) {
    Map<String, Object> raw = new LinkedHashMap<String, Object>();
    raw.put("id", taskGroup.getId());
    raw.put("sort_order", taskGroup.getSortOrder());
    raw.put("requirement_id", taskGroup.getRequirementId());
    raw.put("wide_table_id", taskGroup.getWideTableId());
    raw.put("batch_id", taskGroup.getBatchId());
    raw.put("business_date", taskGroup.getBusinessDate());
    raw.put("source_type", taskGroup.getSourceType());
    raw.put("status", taskGroup.getStatus());
    raw.put("plan_version", taskGroup.getPlanVersion());
    raw.put("group_kind", taskGroup.getGroupKind());
    raw.put("partition_type", taskGroup.getPartitionType());
    raw.put("partition_key", taskGroup.getPartitionKey());
    raw.put("partition_label", taskGroup.getPartitionLabel());
    raw.put("total_tasks", taskGroup.getTotalTasks());
    raw.put("completed_tasks", taskGroup.getCompletedTasks());
    raw.put("failed_tasks", taskGroup.getFailedTasks());
    raw.put("triggered_by", taskGroup.getTriggeredBy());
    raw.put("created_at", taskGroup.getCreatedAt());
    raw.put("updated_at", taskGroup.getUpdatedAt());
    return raw;
  }

  private Map<String, Object> buildFetchTask(FetchTask fetchTask) {
    Map<String, Object> raw = new LinkedHashMap<String, Object>();
    raw.put("id", fetchTask.getId());
    raw.put("sort_order", fetchTask.getSortOrder());
    raw.put("requirement_id", fetchTask.getRequirementId());
    raw.put("wide_table_id", fetchTask.getWideTableId());
    raw.put("task_group_id", fetchTask.getTaskGroupId());
    raw.put("batch_id", fetchTask.getBatchId());
    raw.put("row_id", fetchTask.getRowId());
    raw.put("indicator_group_id", fetchTask.getIndicatorGroupId());
    raw.put("indicator_group_name", fetchTask.getIndicatorGroupName());
    raw.put("name", fetchTask.getName());
    raw.put("schema_version", fetchTask.getSchemaVersion());
    raw.put("execution_mode", fetchTask.getExecutionMode());
    raw.put("indicator_keys_json", fetchTask.getIndicatorKeysJson());
    raw.put("dimension_values_json", fetchTask.getDimensionValuesJson());
    raw.put("business_date", fetchTask.getBusinessDate());
    raw.put("status", fetchTask.getStatus());
    raw.put("can_rerun", fetchTask.getCanRerun());
    raw.put("owner", fetchTask.getOwner());
    raw.put("confidence", fetchTask.getConfidence());
    raw.put("plan_version", fetchTask.getPlanVersion());
    raw.put("row_binding_key", fetchTask.getRowBindingKey());
    raw.put("execution_records", Collections.emptyList());
    raw.put("created_at", fetchTask.getCreatedAt());
    raw.put("updated_at", fetchTask.getUpdatedAt());
    return raw;
  }
}
