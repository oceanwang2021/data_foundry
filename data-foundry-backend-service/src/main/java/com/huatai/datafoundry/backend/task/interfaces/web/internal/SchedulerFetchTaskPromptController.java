package com.huatai.datafoundry.backend.task.interfaces.web.internal;

import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.infrastructure.config.InternalCallbackProperties;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Internal read endpoint for scheduler-service to fetch task-instance prompt context.
 *
 * <p>This enables the execution layer to pass instance-level rendered prompts to the agent service.
 */
@RestController
@RequestMapping("/internal/scheduler")
public class SchedulerFetchTaskPromptController {
  private final FetchTaskRepository fetchTaskRepository;
  private final InternalCallbackProperties callbackProperties;

  public SchedulerFetchTaskPromptController(
      FetchTaskRepository fetchTaskRepository,
      InternalCallbackProperties callbackProperties) {
    this.fetchTaskRepository = fetchTaskRepository;
    this.callbackProperties = callbackProperties;
  }

  @GetMapping("/fetch-tasks/{taskId}/prompt")
  public Map<String, Object> getPrompt(
      @RequestHeader(value = "X-Internal-Token", required = false) String internalToken,
      @PathVariable("taskId") String taskId) {
    assertAuthorized(internalToken);
    if (taskId == null || taskId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "taskId is required");
    }
    FetchTask task = fetchTaskRepository.getById(taskId.trim());
    if (task == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
    }
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("task_id", task.getId());
    out.put("rendered_prompt_text", task.getRenderedPromptText());
    out.put("prompt_template_snapshot", task.getPromptTemplateSnapshot());
    return out;
  }

  private void assertAuthorized(String internalToken) {
    if (callbackProperties == null || !callbackProperties.isRequireToken()) {
      return;
    }
    String expected = callbackProperties.getToken();
    if (expected == null || expected.trim().length() == 0) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Callback token not configured");
    }
    String actual = internalToken == null ? "" : internalToken.trim();
    if (!expected.equals(actual)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
    }
  }
}

