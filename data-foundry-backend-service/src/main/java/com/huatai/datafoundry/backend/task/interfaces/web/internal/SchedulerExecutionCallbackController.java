package com.huatai.datafoundry.backend.task.interfaces.web.internal;

import com.huatai.datafoundry.backend.task.application.command.SchedulerExecutionCallbackCommand;
import com.huatai.datafoundry.backend.task.application.service.TaskExecutionCallbackAppService;
import com.huatai.datafoundry.backend.task.infrastructure.config.InternalCallbackProperties;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal callback endpoint for scheduler-service to report execution results.
 *
 * <p>Not used by frontend; keep it additive and stable.
 */
@RestController
@RequestMapping("/internal/scheduler")
public class SchedulerExecutionCallbackController {
  private static final Logger log =
      LoggerFactory.getLogger(SchedulerExecutionCallbackController.class);

  private final TaskExecutionCallbackAppService callbackAppService;
  private final InternalCallbackProperties callbackProperties;

  public SchedulerExecutionCallbackController(
      TaskExecutionCallbackAppService callbackAppService,
      InternalCallbackProperties callbackProperties) {
    this.callbackAppService = callbackAppService;
    this.callbackProperties = callbackProperties;
  }

  @PostMapping("/executions/callback")
  public Map<String, Object> callback(
      @RequestHeader(value = "X-Internal-Token", required = false) String internalToken,
      @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody SchedulerExecutionCallbackCommand command) {
    if (callbackProperties != null && callbackProperties.isRequireToken()) {
      String expected = callbackProperties.getToken();
      if (expected == null || expected.trim().length() == 0) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Callback token not configured");
      }
      String actual = internalToken == null ? "" : internalToken.trim();
      if (!expected.equals(actual)) {
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
      }
    }

    if (command != null) {
      log.info(
          "scheduler callback received: scheduleJobId={}, taskGroupId={}, taskId={}, status={}",
          command.getScheduleJobId(),
          command.getTaskGroupId(),
          command.getTaskId(),
          command.getStatus());
    }
    // Idempotency is ensured by monotonic status merge; header is reserved for tracing/retries.
    return callbackAppService.applyCallback(command);
  }
}
