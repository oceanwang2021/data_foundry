package com.huatai.datafoundry.backend.requirement.application.query.dto;

import java.util.ArrayList;
import java.util.List;

public class FetchTaskResultsReadDto {
  private List<CollectionResultReadDto> collectionResults =
      new ArrayList<CollectionResultReadDto>();
  private List<CollectionResultRowReadDto> collectionResultRows =
      new ArrayList<CollectionResultRowReadDto>();

  public List<CollectionResultReadDto> getCollectionResults() {
    return collectionResults;
  }

  public void setCollectionResults(List<CollectionResultReadDto> collectionResults) {
    this.collectionResults = collectionResults;
  }

  public List<CollectionResultRowReadDto> getCollectionResultRows() {
    return collectionResultRows;
  }

  public void setCollectionResultRows(List<CollectionResultRowReadDto> collectionResultRows) {
    this.collectionResultRows = collectionResultRows;
  }
}
