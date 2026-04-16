package com.huatai.datafoundry.backend.web;

import com.huatai.datafoundry.backend.persistence.FetchTaskMapper;
import com.huatai.datafoundry.backend.persistence.FetchTaskRecord;
import com.huatai.datafoundry.backend.persistence.TaskGroupMapper;
import com.huatai.datafoundry.backend.persistence.TaskGroupRecord;
import com.huatai.datafoundry.backend.service.TaskPlanService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Minimal execution endpoints so the frontend "执行任务组/执行任务/重试" buttons won't 404.
 *
 * Current behavior:
 * - Ensure fetch tasks exist for a task group (lazy generation), then mark statuses as running->completed.
 * - This is a placeholder for the real scheduler/agent pipeline.
 */
@RestController
@RequestMapping("/api")
public class TaskExecutionController {
  private final TaskGroupMapper taskGroupMapper;
  private final FetchTaskMapper fetchTaskMapper;
  private final TaskPlanService taskPlanService;

  public TaskExecutionController(
      TaskGroupMapper taskGroupMapper,
      FetchTaskMapper fetchTaskMapper,
      TaskPlanService taskPlanService) {
    this.taskGroupMapper = taskGroupMapper;
    this.fetchTaskMapper = fetchTaskMapper;
    this.taskPlanService = taskPlanService;
  }

  @PostMapping("/task-groups/{taskGroupId}/execute")
  public Map<String, Object> executeTaskGroup(
      @PathVariable("taskGroupId") String taskGroupId,
      @RequestBody(required = false) Map<String, Object> body) {
    TaskGroupRecord tg = taskGroupMapper.getById(taskGroupId);
    if (tg == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TaskGroup not found");
    }
    taskPlanService.ensureFetchTasksForTaskGroup(tg);
    taskGroupMapper.updateStatus(taskGroupId, "running");
    // For now: instantly mark as completed and keep task rows pending (agent pipeline not wired).
    taskGroupMapper.updateStatus(taskGroupId, "completed");
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  @PostMapping("/task-groups/{taskGroupId}/ensure-tasks")
  public Map<String, Object> ensureTasks(@PathVariable("taskGroupId") String taskGroupId) {
    TaskGroupRecord tg = taskGroupMapper.getById(taskGroupId);
    if (tg == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TaskGroup not found");
    }
    taskPlanService.ensureFetchTasksForTaskGroup(tg);
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    out.put("task_group_id", taskGroupId);
    out.put("task_count", fetchTaskMapper.countByTaskGroup(taskGroupId));
    return out;
  }

  @PostMapping("/tasks/{taskId}/execute")
  public Map<String, Object> executeTask(@PathVariable("taskId") String taskId) {
    fetchTaskMapper.updateStatus(taskId, "running");
    fetchTaskMapper.updateStatus(taskId, "completed");
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }

  @PostMapping("/tasks/{taskId}/retry")
  public Map<String, Object> retryTask(@PathVariable("taskId") String taskId) {
    fetchTaskMapper.updateStatus(taskId, "pending");
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("ok", true);
    return out;
  }


}
