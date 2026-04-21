package com.huatai.datafoundry.backend.task.domain.service;

import com.huatai.datafoundry.backend.task.domain.model.TaskStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Domain rules for execution state transitions (placeholder for M4 gateway pipeline).
 *
 * <p>Currently the backend-service marks statuses synchronously to keep the frontend buttons usable.
 * This service centralizes the allowed transitions so controllers/app services don't scatter if/else.</p>
 */
@Service
public class TaskExecutionDomainService {
  public void assertCanExecuteTaskGroup(String currentStatus) {
    if (TaskStatus.isInvalidated(currentStatus)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "TaskGroup is invalidated");
    }
  }

  public boolean isTaskGroupTerminal(String currentStatus) {
    return TaskStatus.isTerminal(currentStatus);
  }

  public void assertCanExecuteTask(String currentStatus) {
    if (TaskStatus.isInvalidated(currentStatus)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Task is invalidated");
    }
  }

  public boolean isTaskTerminal(String currentStatus) {
    return TaskStatus.isTerminal(currentStatus);
  }

  /** Decide the next status when an execution starts. Returns null if no change is needed. */
  public String nextStatusOnStart(String currentStatus) {
    if (TaskStatus.isTerminal(currentStatus)) {
      return null;
    }
    return TaskStatus.RUNNING;
  }

  /** Decide the next status when an execution completes. Returns null if no change is needed. */
  public String nextStatusOnComplete(String currentStatus) {
    if (TaskStatus.isTerminal(currentStatus)) {
      return null;
    }
    return TaskStatus.COMPLETED;
  }

  /**
   * Decide the next status when a downstream execution callback arrives.
   *
   * <p>Rule: allow upgrade (failed -> completed), never regress (completed -> failed).
   */
  public String mergeStatusOnCallback(String currentStatus, String callbackStatus) {
    if (callbackStatus == null || callbackStatus.trim().isEmpty()) {
      return null;
    }
    if (TaskStatus.isInvalidated(currentStatus)) {
      return null;
    }
    String merged = TaskStatus.preferMoreAdvanced(currentStatus, callbackStatus);
    if (merged == null || merged.equalsIgnoreCase(currentStatus)) {
      return null;
    }
    return merged;
  }

  /** Decide the next status when a retry is requested. Returns null if no change is needed. */
  public String nextStatusOnRetry(String currentStatus) {
    if (TaskStatus.isInvalidated(currentStatus)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Task is invalidated");
    }
    return TaskStatus.PENDING;
  }
}
