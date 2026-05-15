package com.huatai.datafoundry.contract.agent;

import java.util.Map;

public class NarrowIndicatorRow {
  private String businessDate;
  private String indicatorKey;
  private String indicatorColumn;
  private String indicatorName;
  private String indicatorDescription;
  private String value;
  private String rawValue;
  private String unit;
  private String publishedAt;
  private String sourceUrl;
  private String sourceSite;
  private String quoteText;
  private String indicatorLogic;
  private String indicatorLogicSupplement;
  private String maxValue;
  private String minValue;
  private Double confidence;
  private String reasoning;
  private String whyNotFound;
  private Map<String, String> dimensionValues;

  public String getBusinessDate() {
    return businessDate;
  }

  public void setBusinessDate(String businessDate) {
    this.businessDate = businessDate;
  }

  public String getIndicatorKey() {
    return indicatorKey;
  }

  public void setIndicatorKey(String indicatorKey) {
    this.indicatorKey = indicatorKey;
  }

  public String getIndicatorColumn() {
    return indicatorColumn;
  }

  public void setIndicatorColumn(String indicatorColumn) {
    this.indicatorColumn = indicatorColumn;
  }

  public String getIndicatorName() {
    return indicatorName;
  }

  public void setIndicatorName(String indicatorName) {
    this.indicatorName = indicatorName;
  }

  public String getIndicatorDescription() {
    return indicatorDescription;
  }

  public void setIndicatorDescription(String indicatorDescription) {
    this.indicatorDescription = indicatorDescription;
  }

  public String getValue() {
    return value;
  }

  public void setValue(String value) {
    this.value = value;
  }

  public String getRawValue() {
    return rawValue;
  }

  public void setRawValue(String rawValue) {
    this.rawValue = rawValue;
  }

  public String getUnit() {
    return unit;
  }

  public void setUnit(String unit) {
    this.unit = unit;
  }

  public String getPublishedAt() {
    return publishedAt;
  }

  public void setPublishedAt(String publishedAt) {
    this.publishedAt = publishedAt;
  }

  public String getSourceUrl() {
    return sourceUrl;
  }

  public void setSourceUrl(String sourceUrl) {
    this.sourceUrl = sourceUrl;
  }

  public String getSourceSite() {
    return sourceSite;
  }

  public void setSourceSite(String sourceSite) {
    this.sourceSite = sourceSite;
  }

  public String getQuoteText() {
    return quoteText;
  }

  public void setQuoteText(String quoteText) {
    this.quoteText = quoteText;
  }

  public String getIndicatorLogic() {
    return indicatorLogic;
  }

  public void setIndicatorLogic(String indicatorLogic) {
    this.indicatorLogic = indicatorLogic;
  }

  public String getIndicatorLogicSupplement() {
    return indicatorLogicSupplement;
  }

  public void setIndicatorLogicSupplement(String indicatorLogicSupplement) {
    this.indicatorLogicSupplement = indicatorLogicSupplement;
  }

  public String getMaxValue() {
    return maxValue;
  }

  public void setMaxValue(String maxValue) {
    this.maxValue = maxValue;
  }

  public String getMinValue() {
    return minValue;
  }

  public void setMinValue(String minValue) {
    this.minValue = minValue;
  }

  public Double getConfidence() {
    return confidence;
  }

  public void setConfidence(Double confidence) {
    this.confidence = confidence;
  }

  public String getReasoning() {
    return reasoning;
  }

  public void setReasoning(String reasoning) {
    this.reasoning = reasoning;
  }

  public String getWhyNotFound() {
    return whyNotFound;
  }

  public void setWhyNotFound(String whyNotFound) {
    this.whyNotFound = whyNotFound;
  }

  public Map<String, String> getDimensionValues() {
    return dimensionValues;
  }

  public void setDimensionValues(Map<String, String> dimensionValues) {
    this.dimensionValues = dimensionValues;
  }
}

