package com.huatai.datafoundry.contract.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class AgentExecutionResponse {
  private String taskId;
  private String externalTaskId;
  private String status;
  private List<AgentIndicatorResult> indicators = new ArrayList<AgentIndicatorResult>();
  private List<RetrievalTaskResult> retrievalTasks = new ArrayList<RetrievalTaskResult>();
  private String finalReport;
  private Map<String, Object> rawResult;
  private List<String> warnings = new ArrayList<String>();
  private List<NarrowIndicatorRow> normalizedRows = new ArrayList<NarrowIndicatorRow>();
  private Integer durationMs;
  private String errorMessage;

  public String getTaskId() {
    return taskId;
  }

  public void setTaskId(String taskId) {
    this.taskId = taskId;
  }

  public String getExternalTaskId() {
    return externalTaskId;
  }

  public void setExternalTaskId(String externalTaskId) {
    this.externalTaskId = externalTaskId;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public List<AgentIndicatorResult> getIndicators() {
    return indicators;
  }

  public void setIndicators(List<AgentIndicatorResult> indicators) {
    this.indicators = indicators;
  }

  public List<RetrievalTaskResult> getRetrievalTasks() {
    return retrievalTasks;
  }

  public void setRetrievalTasks(List<RetrievalTaskResult> retrievalTasks) {
    this.retrievalTasks = retrievalTasks;
  }

  public String getFinalReport() {
    return finalReport;
  }

  public void setFinalReport(String finalReport) {
    this.finalReport = finalReport;
  }

  public Map<String, Object> getRawResult() {
    return rawResult;
  }

  public void setRawResult(Map<String, Object> rawResult) {
    this.rawResult = rawResult;
  }

  public List<String> getWarnings() {
    return warnings;
  }

  public void setWarnings(List<String> warnings) {
    this.warnings = warnings;
  }

  public List<NarrowIndicatorRow> getNormalizedRows() {
    return normalizedRows;
  }

  public void setNormalizedRows(List<NarrowIndicatorRow> normalizedRows) {
    this.normalizedRows = normalizedRows;
  }

  public Integer getDurationMs() {
    return durationMs;
  }

  public void setDurationMs(Integer durationMs) {
    this.durationMs = durationMs;
  }

  public String getErrorMessage() {
    return errorMessage;
  }

  public void setErrorMessage(String errorMessage) {
    this.errorMessage = errorMessage;
  }
}

