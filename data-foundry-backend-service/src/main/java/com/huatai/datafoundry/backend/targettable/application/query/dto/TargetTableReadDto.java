package com.huatai.datafoundry.backend.targettable.application.query.dto;

public class TargetTableReadDto {
  private String tableName;
  private String tableComment;
  private Object createTime;
  private Object updateTime;

  public String getTableName() {
    return tableName;
  }

  public void setTableName(String tableName) {
    this.tableName = tableName;
  }

  public String getTableComment() {
    return tableComment;
  }

  public void setTableComment(String tableComment) {
    this.tableComment = tableComment;
  }

  public Object getCreateTime() {
    return createTime;
  }

  public void setCreateTime(Object createTime) {
    this.createTime = createTime;
  }

  public Object getUpdateTime() {
    return updateTime;
  }

  public void setUpdateTime(Object updateTime) {
    this.updateTime = updateTime;
  }
}

