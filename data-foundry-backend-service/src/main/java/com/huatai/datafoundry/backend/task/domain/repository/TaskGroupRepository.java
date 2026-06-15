package com.huatai.datafoundry.backend.task.domain.repository;

import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import java.time.LocalDateTime;
import java.util.List;

public interface TaskGroupRepository {
  int countByRequirement(String requirementId);

  TaskGroup getById(String taskGroupId);

  TaskGroup getByScheduleRulePeriodAndIndicatorGroup(
      String scheduleRuleId, String businessDate, String indicatorGroupId);

  TaskGroup findNextPendingByScheduleRule(String scheduleRuleId);

  List<TaskGroup> listAll();

  List<TaskGroup> listByIds(List<String> taskGroupIds);

  List<TaskGroup> listByRequirement(String requirementId);

  List<TaskGroup> listByRequirementAndWideTable(String requirementId, String wideTableId);

  int upsert(TaskGroup taskGroup);

  int insertIfAbsent(TaskGroup taskGroup);

  int upsertBatch(List<TaskGroup> taskGroups);

  int updateStatus(String taskGroupId, String status);

  int updateStatusByIds(List<String> taskGroupIds, String status);

  int updatePendingSchedule(
      String taskGroupId, String scheduleRuleId, LocalDateTime scheduledAt);
}
