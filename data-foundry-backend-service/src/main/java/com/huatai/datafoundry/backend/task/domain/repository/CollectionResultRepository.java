package com.huatai.datafoundry.backend.task.domain.repository;

import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import java.util.List;

public interface CollectionResultRepository {
  int upsertResult(CollectionResult result);

  int deleteRowsByResultId(String resultId);

  int insertRows(List<CollectionResultRow> rows);

  CollectionResult getResultByTaskAndId(String fetchTaskId, String resultId);

  int updateNormalizedRowsJson(String fetchTaskId, String resultId, String normalizedRowsJson);

  List<CollectionResult> listResultsByTask(String fetchTaskId);

  List<CollectionResult> listResultsByTaskGroup(String taskGroupId);

  List<CollectionResult> listResultsByWideTable(String wideTableId);

  List<CollectionResultRow> listRowsByTask(String fetchTaskId);
}
