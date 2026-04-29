package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class RequirementSearchItemReadDto {
  private RequirementReadDto requirement;
  private ProjectSummaryReadDto project;
  private WideTableSummaryReadDto wideTable;

  public RequirementReadDto getRequirement() {
    return requirement;
  }

  public void setRequirement(RequirementReadDto requirement) {
    this.requirement = requirement;
  }

  public ProjectSummaryReadDto getProject() {
    return project;
  }

  public void setProject(ProjectSummaryReadDto project) {
    this.project = project;
  }

  public WideTableSummaryReadDto getWideTable() {
    return wideTable;
  }

  public void setWideTable(WideTableSummaryReadDto wideTable) {
    this.wideTable = wideTable;
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public static class ProjectSummaryReadDto {
    private String id;
    private String name;

    public String getId() {
      return id;
    }

    public void setId(String id) {
      this.id = id;
    }

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public static class WideTableSummaryReadDto {
    private String id;
    private String tableName;
    private Integer columnCount;
    private Integer recordCount;

    public String getId() {
      return id;
    }

    public void setId(String id) {
      this.id = id;
    }

    public String getTableName() {
      return tableName;
    }

    public void setTableName(String tableName) {
      this.tableName = tableName;
    }

    public Integer getColumnCount() {
      return columnCount;
    }

    public void setColumnCount(Integer columnCount) {
      this.columnCount = columnCount;
    }

    public Integer getRecordCount() {
      return recordCount;
    }

    public void setRecordCount(Integer recordCount) {
      this.recordCount = recordCount;
    }
  }
}

