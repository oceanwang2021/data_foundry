package com.huatai.datafoundry.backend.task.domain.gateway;

/**
 * Gateway for invoking the collection/search API.
 *
 * <p>Trial-run needs a synchronous "was the API called successfully" signal so the UI and
 * fetch_task statuses can be updated deterministically.</p>
 */
public interface CollectionSearchGateway {

  /** Create a downstream search task. Returns null when the call is rejected/unavailable. */
  CollectionSearchResult createSearch(Object requestBody, String idempotencyKey);

  class CollectionSearchResult {
    private final boolean success;
    private final String taskId;
    private final String errorMessage;

    public CollectionSearchResult(boolean success, String taskId, String errorMessage) {
      this.success = success;
      this.taskId = taskId;
      this.errorMessage = errorMessage;
    }

    public boolean isSuccess() {
      return success;
    }

    public String getTaskId() {
      return taskId;
    }

    public String getErrorMessage() {
      return errorMessage;
    }
  }
}

