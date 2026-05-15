package com.huatai.datafoundry.backend.task.infrastructure.repository;

import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import com.huatai.datafoundry.backend.task.domain.repository.CollectionResultRepository;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.CollectionResultMapper;
import java.util.Collections;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisCollectionResultRepository implements CollectionResultRepository {
  private final CollectionResultMapper collectionResultMapper;

  public MybatisCollectionResultRepository(CollectionResultMapper collectionResultMapper) {
    this.collectionResultMapper = collectionResultMapper;
  }

  @Override
  public int upsertResult(CollectionResult result) {
    return collectionResultMapper.upsertResult(result);
  }

  @Override
  public int deleteRowsByResultId(String resultId) {
    return collectionResultMapper.deleteRowsByResultId(resultId);
  }

  @Override
  public int insertRows(List<CollectionResultRow> rows) {
    if (rows == null || rows.isEmpty()) {
      return 0;
    }
    return collectionResultMapper.insertRows(rows);
  }

  @Override
  public CollectionResult getResultByTaskAndId(String fetchTaskId, String resultId) {
    return collectionResultMapper.getResultByTaskAndId(fetchTaskId, resultId);
  }

  @Override
  public int updateNormalizedRowsJson(String fetchTaskId, String resultId, String normalizedRowsJson) {
    return collectionResultMapper.updateNormalizedRowsJson(fetchTaskId, resultId, normalizedRowsJson);
  }

  @Override
  public List<CollectionResult> listResultsByTask(String fetchTaskId) {
    List<CollectionResult> rows = collectionResultMapper.listResultsByTask(fetchTaskId);
    return rows != null ? rows : Collections.<CollectionResult>emptyList();
  }

  @Override
  public List<CollectionResult> listResultsByTaskGroup(String taskGroupId) {
    List<CollectionResult> rows = collectionResultMapper.listResultsByTaskGroup(taskGroupId);
    return rows != null ? rows : Collections.<CollectionResult>emptyList();
  }

  @Override
  public List<CollectionResult> listResultsByWideTable(String wideTableId) {
    List<CollectionResult> rows = collectionResultMapper.listResultsByWideTable(wideTableId);
    return rows != null ? rows : Collections.<CollectionResult>emptyList();
  }

  @Override
  public List<CollectionResultRow> listRowsByTask(String fetchTaskId) {
    List<CollectionResultRow> rows = collectionResultMapper.listRowsByTask(fetchTaskId);
    return rows != null ? rows : Collections.<CollectionResultRow>emptyList();
  }
}
