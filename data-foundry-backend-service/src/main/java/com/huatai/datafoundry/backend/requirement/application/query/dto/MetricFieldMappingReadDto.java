package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class MetricFieldMappingReadDto {
  private String id;
  private String requirementId;
  private String wideTableId;
  private String sourceMetricName;
  private String targetIndicatorKey;
  private String targetIndicatorName;
  private String matchType;
  private BigDecimal confidence;
  private String status;
  private Object createdAt;
  private Object updatedAt;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getRequirementId() { return requirementId; }
  public void setRequirementId(String requirementId) { this.requirementId = requirementId; }
  public String getWideTableId() { return wideTableId; }
  public void setWideTableId(String wideTableId) { this.wideTableId = wideTableId; }
  public String getSourceMetricName() { return sourceMetricName; }
  public void setSourceMetricName(String sourceMetricName) { this.sourceMetricName = sourceMetricName; }
  public String getTargetIndicatorKey() { return targetIndicatorKey; }
  public void setTargetIndicatorKey(String targetIndicatorKey) { this.targetIndicatorKey = targetIndicatorKey; }
  public String getTargetIndicatorName() { return targetIndicatorName; }
  public void setTargetIndicatorName(String targetIndicatorName) { this.targetIndicatorName = targetIndicatorName; }
  public String getMatchType() { return matchType; }
  public void setMatchType(String matchType) { this.matchType = matchType; }
  public BigDecimal getConfidence() { return confidence; }
  public void setConfidence(BigDecimal confidence) { this.confidence = confidence; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public Object getCreatedAt() { return createdAt; }
  public void setCreatedAt(Object createdAt) { this.createdAt = createdAt; }
  public Object getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Object updatedAt) { this.updatedAt = updatedAt; }
}
