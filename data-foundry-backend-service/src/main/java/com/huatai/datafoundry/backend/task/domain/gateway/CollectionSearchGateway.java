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

  /** Query downstream task status. Returns null when the call is rejected/unavailable. */
  CollectionTaskStatusResult getTaskStatus(String taskId);

  /** Query downstream completed task result. Returns null when the call is rejected/unavailable. */
  CollectionTaskResult getTaskResult(String taskId);

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

  class CollectionTaskStatusResult {
    private final boolean success;
    private final String taskId;
    private final String status;
    private final String errorMessage;

    public CollectionTaskStatusResult(
        boolean success, String taskId, String status, String errorMessage) {
      this.success = success;
      this.taskId = taskId;
      this.status = status;
      this.errorMessage = errorMessage;
    }

    public boolean isSuccess() {
      return success;
    }

    public String getTaskId() {
      return taskId;
    }

    public String getStatus() {
      return status;
    }

    public String getErrorMessage() {
      return errorMessage;
    }
  }

  class CollectionTaskResult {
    private final boolean success;
    private final String taskId;
    private final String status;
    private final String finalReport;
    private final String rawResponseJson;
    private final String errorMessage;

    public CollectionTaskResult(
        boolean success,
        String taskId,
        String status,
        String finalReport,
        String rawResponseJson,
        String errorMessage) {
      this.success = success;
      this.taskId = taskId;
      this.status = status;
      this.finalReport = finalReport;
      this.rawResponseJson = rawResponseJson;
      this.errorMessage = errorMessage;
    }

    public boolean isSuccess() {
      return success;
    }

    public String getTaskId() {
      return taskId;
    }

    public String getStatus() {
      return status;
    }

    public String getFinalReport() {
      return finalReport;
    }

    public String getRawResponseJson() {
      return rawResponseJson;
    }

    public String getErrorMessage() {
      return errorMessage;
    }
  }
}
