package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class CollectionResultReadDto {
  private String id;
  private String fetchTaskId;
  private String scheduleJobId;
  private String externalTaskId;
  private String taskGroupId;
  private String batchId;
  private String wideTableId;
  private Integer rowId;
  private String rawResultJson;
  private String finalReport;
  private String normalizedRowsJson;
  private String status;
  private String errorMsg;
  private Integer durationMs;
  private Object collectedAt;
  private Object createdAt;
  private Object updatedAt;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getFetchTaskId() { return fetchTaskId; }
  public void setFetchTaskId(String fetchTaskId) { this.fetchTaskId = fetchTaskId; }
  public String getScheduleJobId() { return scheduleJobId; }
  public void setScheduleJobId(String scheduleJobId) { this.scheduleJobId = scheduleJobId; }
  public String getExternalTaskId() { return externalTaskId; }
  public void setExternalTaskId(String externalTaskId) { this.externalTaskId = externalTaskId; }
  public String getTaskGroupId() { return taskGroupId; }
  public void setTaskGroupId(String taskGroupId) { this.taskGroupId = taskGroupId; }
  public String getBatchId() { return batchId; }
  public void setBatchId(String batchId) { this.batchId = batchId; }
  public String getWideTableId() { return wideTableId; }
  public void setWideTableId(String wideTableId) { this.wideTableId = wideTableId; }
  public Integer getRowId() { return rowId; }
  public void setRowId(Integer rowId) { this.rowId = rowId; }
  public String getRawResultJson() { return rawResultJson; }
  public void setRawResultJson(String rawResultJson) { this.rawResultJson = rawResultJson; }
  public String getFinalReport() { return finalReport; }
  public void setFinalReport(String finalReport) { this.finalReport = finalReport; }
  public String getNormalizedRowsJson() { return normalizedRowsJson; }
  public void setNormalizedRowsJson(String normalizedRowsJson) { this.normalizedRowsJson = normalizedRowsJson; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getErrorMsg() { return errorMsg; }
  public void setErrorMsg(String errorMsg) { this.errorMsg = errorMsg; }
  public Integer getDurationMs() { return durationMs; }
  public void setDurationMs(Integer durationMs) { this.durationMs = durationMs; }
  public Object getCollectedAt() { return collectedAt; }
  public void setCollectedAt(Object collectedAt) { this.collectedAt = collectedAt; }
  public Object getCreatedAt() { return createdAt; }
  public void setCreatedAt(Object createdAt) { this.createdAt = createdAt; }
  public Object getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Object updatedAt) { this.updatedAt = updatedAt; }
}
