package com.huatai.datafoundry.backend.task.domain.model;

public class WideTableRowValuePatch {
  private String wideTableId;
  private Integer rowId;
  private String indicatorValuesJson;
  private String rowStatus;

  public String getWideTableId() {
    return wideTableId;
  }

  public void setWideTableId(String wideTableId) {
    this.wideTableId = wideTableId;
  }

  public Integer getRowId() {
    return rowId;
  }

  public void setRowId(Integer rowId) {
    this.rowId = rowId;
  }

  public String getIndicatorValuesJson() {
    return indicatorValuesJson;
  }

  public void setIndicatorValuesJson(String indicatorValuesJson) {
    this.indicatorValuesJson = indicatorValuesJson;
  }

  public String getRowStatus() {
    return rowStatus;
  }

  public void setRowStatus(String rowStatus) {
    this.rowStatus = rowStatus;
  }
}
