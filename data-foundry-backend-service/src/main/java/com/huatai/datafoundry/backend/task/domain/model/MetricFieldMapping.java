package com.huatai.datafoundry.backend.task.domain.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class MetricFieldMapping {
  private String id;
  private String requirementId;
  private String wideTableId;
  private String sourceMetricName;
  private String targetIndicatorKey;
  private String targetIndicatorName;
  private String matchType;
  private BigDecimal confidence;
  private String status;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

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
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
  public LocalDateTime getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
