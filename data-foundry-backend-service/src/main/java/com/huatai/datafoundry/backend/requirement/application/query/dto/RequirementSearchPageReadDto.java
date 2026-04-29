package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class RequirementSearchPageReadDto {
  private int page;
  private int pageSize;
  private long total;
  private List<RequirementSearchItemReadDto> items;

  public int getPage() {
    return page;
  }

  public void setPage(int page) {
    this.page = page;
  }

  public int getPageSize() {
    return pageSize;
  }

  public void setPageSize(int pageSize) {
    this.pageSize = pageSize;
  }

  public long getTotal() {
    return total;
  }

  public void setTotal(long total) {
    this.total = total;
  }

  public List<RequirementSearchItemReadDto> getItems() {
    return items;
  }

  public void setItems(List<RequirementSearchItemReadDto> items) {
    this.items = items;
  }
}

