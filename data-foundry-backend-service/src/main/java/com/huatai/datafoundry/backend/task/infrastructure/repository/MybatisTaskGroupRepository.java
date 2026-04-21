package com.huatai.datafoundry.backend.task.infrastructure.repository;

import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.TaskGroupMapper;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.record.TaskGroupRecord;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisTaskGroupRepository implements TaskGroupRepository {
  private final TaskGroupMapper taskGroupMapper;

  public MybatisTaskGroupRepository(TaskGroupMapper taskGroupMapper) {
    this.taskGroupMapper = taskGroupMapper;
  }

  @Override
  public int countByRequirement(String requirementId) {
    return taskGroupMapper.countByRequirement(requirementId);
  }

  @Override
  public TaskGroup getById(String taskGroupId) {
    TaskGroupRecord record = taskGroupMapper.getById(taskGroupId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public List<TaskGroup> listByIds(List<String> taskGroupIds) {
    List<TaskGroupRecord> records = taskGroupMapper.listByIds(taskGroupIds);
    return toDomainList(records);
  }

  @Override
  public List<TaskGroup> listByRequirement(String requirementId) {
    List<TaskGroupRecord> records = taskGroupMapper.listByRequirement(requirementId);
    return toDomainList(records);
  }

  @Override
  public List<TaskGroup> listByRequirementAndWideTable(String requirementId, String wideTableId) {
    List<TaskGroupRecord> records = taskGroupMapper.listByRequirementAndWideTable(requirementId, wideTableId);
    return toDomainList(records);
  }

  @Override
  public int upsert(TaskGroup taskGroup) {
    return taskGroupMapper.upsert(toRecord(taskGroup));
  }

  @Override
  public int upsertBatch(List<TaskGroup> taskGroups) {
    if (taskGroups == null) return 0;
    List<TaskGroupRecord> records = new ArrayList<TaskGroupRecord>(taskGroups.size());
    for (TaskGroup tg : taskGroups) {
      if (tg == null) continue;
      records.add(toRecord(tg));
    }
    return taskGroupMapper.upsertBatch(records);
  }

  @Override
  public int updateStatus(String taskGroupId, String status) {
    return taskGroupMapper.updateStatus(taskGroupId, status);
  }

  @Override
  public int updateStatusByIds(List<String> taskGroupIds, String status) {
    return taskGroupMapper.updateStatusByIds(taskGroupIds, status);
  }

  private static List<TaskGroup> toDomainList(List<TaskGroupRecord> records) {
    if (records == null) return new ArrayList<TaskGroup>();
    List<TaskGroup> out = new ArrayList<TaskGroup>(records.size());
    for (TaskGroupRecord record : records) {
      if (record == null) continue;
      out.add(toDomain(record));
    }
    return out;
  }

  private static TaskGroup toDomain(TaskGroupRecord record) {
    TaskGroup tg = new TaskGroup();
    tg.setId(record.getId());
    tg.setSortOrder(record.getSortOrder());
    tg.setRequirementId(record.getRequirementId());
    tg.setWideTableId(record.getWideTableId());
    tg.setBatchId(record.getBatchId());
    tg.setBusinessDate(record.getBusinessDate());
    tg.setSourceType(record.getSourceType());
    tg.setStatus(record.getStatus());
    tg.setScheduleRuleId(record.getScheduleRuleId());
    tg.setBackfillRequestId(record.getBackfillRequestId());
    tg.setPlanVersion(record.getPlanVersion());
    tg.setGroupKind(record.getGroupKind());
    tg.setPartitionType(record.getPartitionType());
    tg.setPartitionKey(record.getPartitionKey());
    tg.setPartitionLabel(record.getPartitionLabel());
    tg.setTotalTasks(record.getTotalTasks());
    tg.setCompletedTasks(record.getCompletedTasks());
    tg.setFailedTasks(record.getFailedTasks());
    tg.setTriggeredBy(record.getTriggeredBy());
    tg.setCreatedAt(record.getCreatedAt());
    tg.setUpdatedAt(record.getUpdatedAt());
    return tg;
  }

  private static TaskGroupRecord toRecord(TaskGroup taskGroup) {
    if (taskGroup == null) return null;
    TaskGroupRecord record = new TaskGroupRecord();
    record.setId(taskGroup.getId());
    record.setSortOrder(taskGroup.getSortOrder());
    record.setRequirementId(taskGroup.getRequirementId());
    record.setWideTableId(taskGroup.getWideTableId());
    record.setBatchId(taskGroup.getBatchId());
    record.setBusinessDate(taskGroup.getBusinessDate());
    record.setSourceType(taskGroup.getSourceType());
    record.setStatus(taskGroup.getStatus());
    record.setScheduleRuleId(taskGroup.getScheduleRuleId());
    record.setBackfillRequestId(taskGroup.getBackfillRequestId());
    record.setPlanVersion(taskGroup.getPlanVersion());
    record.setGroupKind(taskGroup.getGroupKind());
    record.setPartitionType(taskGroup.getPartitionType());
    record.setPartitionKey(taskGroup.getPartitionKey());
    record.setPartitionLabel(taskGroup.getPartitionLabel());
    record.setTotalTasks(taskGroup.getTotalTasks());
    record.setCompletedTasks(taskGroup.getCompletedTasks());
    record.setFailedTasks(taskGroup.getFailedTasks());
    record.setTriggeredBy(taskGroup.getTriggeredBy());
    return record;
  }
}
