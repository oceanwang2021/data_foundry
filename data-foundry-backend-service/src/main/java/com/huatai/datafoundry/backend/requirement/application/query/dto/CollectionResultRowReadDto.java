package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class CollectionResultRowReadDto {
  private String id;
  private String collectionResultId;
  private String fetchTaskId;
  private String scheduleJobId;
  private String wideTableId;
  private Integer rowId;
  private String indicatorKey;
  private String indicatorName;
  private String businessDate;
  private String dimensionValuesJson;
  private String rawValue;
  private String cleanedValue;
  private String unit;
  private String publishedAt;
  private String sourceSite;
  private String sourceUrl;
  private String quoteText;
  private String maxValue;
  private String minValue;
  private BigDecimal confidence;
  private String status;
  private String warningMsg;
  private String reasoning;
  private String whyNotFound;
  private Object createdAt;
  private Object updatedAt;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getCollectionResultId() { return collectionResultId; }
  public void setCollectionResultId(String collectionResultId) { this.collectionResultId = collectionResultId; }
  public String getFetchTaskId() { return fetchTaskId; }
  public void setFetchTaskId(String fetchTaskId) { this.fetchTaskId = fetchTaskId; }
  public String getScheduleJobId() { return scheduleJobId; }
  public void setScheduleJobId(String scheduleJobId) { this.scheduleJobId = scheduleJobId; }
  public String getWideTableId() { return wideTableId; }
  public void setWideTableId(String wideTableId) { this.wideTableId = wideTableId; }
  public Integer getRowId() { return rowId; }
  public void setRowId(Integer rowId) { this.rowId = rowId; }
  public String getIndicatorKey() { return indicatorKey; }
  public void setIndicatorKey(String indicatorKey) { this.indicatorKey = indicatorKey; }
  public String getIndicatorName() { return indicatorName; }
  public void setIndicatorName(String indicatorName) { this.indicatorName = indicatorName; }
  public String getBusinessDate() { return businessDate; }
  public void setBusinessDate(String businessDate) { this.businessDate = businessDate; }
  public String getDimensionValuesJson() { return dimensionValuesJson; }
  public void setDimensionValuesJson(String dimensionValuesJson) { this.dimensionValuesJson = dimensionValuesJson; }
  public String getRawValue() { return rawValue; }
  public void setRawValue(String rawValue) { this.rawValue = rawValue; }
  public String getCleanedValue() { return cleanedValue; }
  public void setCleanedValue(String cleanedValue) { this.cleanedValue = cleanedValue; }
  public String getUnit() { return unit; }
  public void setUnit(String unit) { this.unit = unit; }
  public String getPublishedAt() { return publishedAt; }
  public void setPublishedAt(String publishedAt) { this.publishedAt = publishedAt; }
  public String getSourceSite() { return sourceSite; }
  public void setSourceSite(String sourceSite) { this.sourceSite = sourceSite; }
  public String getSourceUrl() { return sourceUrl; }
  public void setSourceUrl(String sourceUrl) { this.sourceUrl = sourceUrl; }
  public String getQuoteText() { return quoteText; }
  public void setQuoteText(String quoteText) { this.quoteText = quoteText; }
  public String getMaxValue() { return maxValue; }
  public void setMaxValue(String maxValue) { this.maxValue = maxValue; }
  public String getMinValue() { return minValue; }
  public void setMinValue(String minValue) { this.minValue = minValue; }
  public BigDecimal getConfidence() { return confidence; }
  public void setConfidence(BigDecimal confidence) { this.confidence = confidence; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getWarningMsg() { return warningMsg; }
  public void setWarningMsg(String warningMsg) { this.warningMsg = warningMsg; }
  public String getReasoning() { return reasoning; }
  public void setReasoning(String reasoning) { this.reasoning = reasoning; }
  public String getWhyNotFound() { return whyNotFound; }
  public void setWhyNotFound(String whyNotFound) { this.whyNotFound = whyNotFound; }
  public Object getCreatedAt() { return createdAt; }
  public void setCreatedAt(Object createdAt) { this.createdAt = createdAt; }
  public Object getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Object updatedAt) { this.updatedAt = updatedAt; }
}
