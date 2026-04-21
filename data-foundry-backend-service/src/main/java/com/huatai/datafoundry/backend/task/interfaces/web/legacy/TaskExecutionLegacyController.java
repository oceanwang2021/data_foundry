package com.huatai.datafoundry.backend.task.interfaces.web.legacy;

import com.huatai.datafoundry.backend.task.application.service.TaskAppService;
import java.util.Map;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Legacy execution endpoints so the current frontend buttons won't 404.
 *
 * <p>Keep the routes stable; delegate to application service.
 */
@RestController
@RequestMapping("/api")
public class TaskExecutionLegacyController {
  private final TaskAppService taskAppService;

  public TaskExecutionLegacyController(TaskAppService taskAppService) {
    this.taskAppService = taskAppService;
  }

  @PostMapping("/task-groups/{taskGroupId}/execute")
  public Map<String, Object> executeTaskGroup(
      @PathVariable("taskGroupId") String taskGroupId,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody(required = false) Map<String, Object> body) {
    return taskAppService.executeTaskGroup(taskGroupId, body, idempotencyKey);
  }

  @PostMapping("/task-groups/{taskGroupId}/ensure-tasks")
  public Map<String, Object> ensureTasks(@PathVariable("taskGroupId") String taskGroupId) {
    return taskAppService.ensureTasks(taskGroupId);
  }

  @PostMapping("/tasks/{taskId}/execute")
  public Map<String, Object> executeTask(
      @PathVariable("taskId") String taskId,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey) {
    return taskAppService.executeTask(taskId, idempotencyKey);
  }

  @PostMapping("/tasks/{taskId}/retry")
  public Map<String, Object> retryTask(
      @PathVariable("taskId") String taskId,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey) {
    return taskAppService.retryTask(taskId, idempotencyKey);
  }
}
