package com.huatai.datafoundry.backend.task.domain.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.huatai.datafoundry.backend.task.domain.model.TaskStatus;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class TaskExecutionDomainServiceTest {

  private final TaskExecutionDomainService svc = new TaskExecutionDomainService();

  @Test
  void nextStatusOnStartDoesNothingForTerminal() {
    assertNull(svc.nextStatusOnStart(TaskStatus.COMPLETED));
    assertNull(svc.nextStatusOnStart(TaskStatus.INVALIDATED));
  }

  @Test
  void nextStatusOnStartMovesToRunning() {
    assertEquals(TaskStatus.RUNNING, svc.nextStatusOnStart(TaskStatus.PENDING));
    assertEquals(TaskStatus.RUNNING, svc.nextStatusOnStart(TaskStatus.FAILED));
    assertEquals(TaskStatus.RUNNING, svc.nextStatusOnStart(null));
  }

  @Test
  void nextStatusOnCompleteDoesNothingForTerminal() {
    assertNull(svc.nextStatusOnComplete(TaskStatus.COMPLETED));
    assertNull(svc.nextStatusOnComplete(TaskStatus.INVALIDATED));
  }

  @Test
  void nextStatusOnCompleteMovesToCompleted() {
    assertEquals(TaskStatus.COMPLETED, svc.nextStatusOnComplete(TaskStatus.RUNNING));
    assertEquals(TaskStatus.COMPLETED, svc.nextStatusOnComplete(TaskStatus.PENDING));
  }

  @Test
  void nextStatusOnRetryRejectsInvalidated() {
    ResponseStatusException ex =
        assertThrows(ResponseStatusException.class, () -> svc.nextStatusOnRetry(TaskStatus.INVALIDATED));
    assertEquals(HttpStatus.CONFLICT, ex.getStatus());
  }

  @Test
  void nextStatusOnRetryMovesToPending() {
    assertEquals(TaskStatus.PENDING, svc.nextStatusOnRetry(TaskStatus.FAILED));
    assertEquals(TaskStatus.PENDING, svc.nextStatusOnRetry(TaskStatus.COMPLETED));
    assertEquals(TaskStatus.PENDING, svc.nextStatusOnRetry(TaskStatus.PENDING));
  }
}

