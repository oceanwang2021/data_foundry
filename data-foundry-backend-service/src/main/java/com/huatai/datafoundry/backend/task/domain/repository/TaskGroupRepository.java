package com.huatai.datafoundry.backend.task.domain.repository;

import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import java.util.List;

public interface TaskGroupRepository {
  int countByRequirement(String requirementId);

  TaskGroup getById(String taskGroupId);

  List<TaskGroup> listByIds(List<String> taskGroupIds);

  List<TaskGroup> listByRequirement(String requirementId);

  List<TaskGroup> listByRequirementAndWideTable(String requirementId, String wideTableId);

  int upsert(TaskGroup taskGroup);

  int upsertBatch(List<TaskGroup> taskGroups);

  int updateStatus(String taskGroupId, String status);

  int updateStatusByIds(List<String> taskGroupIds, String status);
}
