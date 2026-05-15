package com.huatai.datafoundry.backend.task.domain.repository;

import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import java.math.BigDecimal;
import java.util.List;

public interface FetchTaskRepository {
  FetchTask getById(String taskId);

  List<FetchTask> listByRequirement(String requirementId);

  List<FetchTask> listByTaskGroup(String taskGroupId);

  int countByTaskGroup(String taskGroupId);

  int upsertBatch(List<FetchTask> tasks);

  int updateStatus(String taskId, String status);

  int updateStatus(String taskId, String status, String collectionTaskId);

  int updateStatusAndConfidence(String taskId, String status, BigDecimal confidence);

}
