package com.huatai.datafoundry.backend.task.interfaces.web;

import com.huatai.datafoundry.backend.requirement.application.query.dto.CollectionResultReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskResultsReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import com.huatai.datafoundry.backend.task.application.service.TaskAppService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Canonical facade for Task application service.
 *
 * <p>Notes:
 * - This controller is additive: it does not change any existing legacy routes.
 * - Response remains "raw JSON" (no Response&lt;T&gt; wrapper) to match current frontend expectations.
 */
@RestController
@RequestMapping("/api/tasks")
public class TaskFacadeController {
  private final TaskAppService taskAppService;
  private final RequirementQueryService requirementQueryService;

  public TaskFacadeController(TaskAppService taskAppService, RequirementQueryService requirementQueryService) {
    this.taskAppService = taskAppService;
    this.requirementQueryService = requirementQueryService;
  }

  @GetMapping("/task-groups")
  public List<TaskGroupReadDto> listTaskGroups(
      @RequestParam("project_id") String projectId,
      @RequestParam("requirement_id") String requirementId) {
    return requirementQueryService.listTaskGroups(projectId, requirementId);
  }

  @GetMapping
  public List<FetchTaskReadDto> listFetchTasks(
      @RequestParam("project_id") String projectId,
      @RequestParam("requirement_id") String requirementId) {
    return requirementQueryService.listFetchTasks(projectId, requirementId);
  }

  @GetMapping("/{taskId}/results")
  public FetchTaskResultsReadDto getTaskResults(@PathVariable("taskId") String taskId) {
    return requirementQueryService.getTaskResults(taskId);
  }

  @GetMapping("/task-groups/{taskGroupId}/results")
  public FetchTaskResultsReadDto getTaskGroupResults(@PathVariable("taskGroupId") String taskGroupId) {
    return requirementQueryService.getTaskGroupResults(taskGroupId);
  }

  @GetMapping("/wide-tables/{wideTableId}/results")
  public FetchTaskResultsReadDto getWideTableResults(@PathVariable("wideTableId") String wideTableId) {
    return requirementQueryService.getWideTableResults(wideTableId);
  }

  @PostMapping("/{taskId}/results/{resultId}/actions/normalize-final-report")
  public CollectionResultReadDto normalizeFinalReport(
      @PathVariable("taskId") String taskId, @PathVariable("resultId") String resultId) {
    return requirementQueryService.normalizeTaskResultFinalReport(taskId, resultId);
  }

  @PostMapping("/wide-tables/{wideTableId}/results/actions/normalize-final-reports")
  public FetchTaskResultsReadDto normalizeWideTableFinalReports(@PathVariable("wideTableId") String wideTableId) {
    return requirementQueryService.normalizeWideTableFinalReports(wideTableId);
  }

  @PostMapping("/task-groups/{taskGroupId}/results/actions/normalize-final-reports")
  public FetchTaskResultsReadDto normalizeTaskGroupFinalReports(@PathVariable("taskGroupId") String taskGroupId) {
    return requirementQueryService.normalizeTaskGroupFinalReports(taskGroupId);
  }

  @GetMapping("/{taskId}/runs")
  public List<Map<String, Object>> listTaskRuns(@PathVariable("taskId") String taskId) {
    return requirementQueryService.listTaskRuns(taskId);
  }

  @PostMapping("/task-groups/{taskGroupId}/actions/execute")
  public Map<String, Object> executeTaskGroup(
      @PathVariable("taskGroupId") String taskGroupId,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody(required = false) Map<String, Object> body) {
    return taskAppService.executeTaskGroup(taskGroupId, body, idempotencyKey);
  }

  @PostMapping("/task-groups/{taskGroupId}/actions/ensure-tasks")
  public Map<String, Object> ensureTasks(@PathVariable("taskGroupId") String taskGroupId) {
    return taskAppService.ensureTasks(taskGroupId);
  }

  @PostMapping("/{taskId}/actions/execute")
  public Map<String, Object> executeTask(
      @PathVariable("taskId") String taskId,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey) {
    return taskAppService.executeTask(taskId, idempotencyKey);
  }

  @PostMapping("/{taskId}/actions/retry")
  public Map<String, Object> retryTask(
      @PathVariable("taskId") String taskId,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey) {
    return taskAppService.retryTask(taskId, idempotencyKey);
  }
}
