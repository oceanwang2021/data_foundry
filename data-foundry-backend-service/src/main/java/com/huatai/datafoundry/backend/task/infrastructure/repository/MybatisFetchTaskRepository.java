package com.huatai.datafoundry.backend.task.infrastructure.repository;

import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper.FetchTaskMapper;
import com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.record.FetchTaskRecord;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisFetchTaskRepository implements FetchTaskRepository {
  private final FetchTaskMapper fetchTaskMapper;

  public MybatisFetchTaskRepository(FetchTaskMapper fetchTaskMapper) {
    this.fetchTaskMapper = fetchTaskMapper;
  }

  @Override
  public FetchTask getById(String taskId) {
    FetchTaskRecord record = fetchTaskMapper.getById(taskId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public List<FetchTask> listByRequirement(String requirementId) {
    List<FetchTaskRecord> records = fetchTaskMapper.listByRequirement(requirementId);
    return toDomainList(records);
  }

  @Override
  public List<FetchTask> listByTaskGroup(String taskGroupId) {
    List<FetchTaskRecord> records = fetchTaskMapper.listByTaskGroup(taskGroupId);
    return toDomainList(records);
  }

  @Override
  public int countByTaskGroup(String taskGroupId) {
    return fetchTaskMapper.countByTaskGroup(taskGroupId);
  }

  @Override
  public int upsertBatch(List<FetchTask> tasks) {
    if (tasks == null) return 0;
    List<FetchTaskRecord> records = new ArrayList<FetchTaskRecord>(tasks.size());
    for (FetchTask task : tasks) {
      if (task == null) continue;
      records.add(toRecord(task));
    }
    return fetchTaskMapper.upsertBatch(records);
  }

  @Override
  public int updateStatus(String taskId, String status) {
    return fetchTaskMapper.updateStatus(taskId, status);
  }

  @Override
  public int updateStatusAndConfidence(String taskId, String status, java.math.BigDecimal confidence) {
    return fetchTaskMapper.updateStatusAndConfidence(taskId, status, confidence);
  }

  private static List<FetchTask> toDomainList(List<FetchTaskRecord> records) {
    if (records == null) return new ArrayList<FetchTask>();
    List<FetchTask> out = new ArrayList<FetchTask>(records.size());
    for (FetchTaskRecord record : records) {
      if (record == null) continue;
      out.add(toDomain(record));
    }
    return out;
  }

  private static FetchTask toDomain(FetchTaskRecord record) {
    FetchTask task = new FetchTask();
    task.setId(record.getId());
    task.setSortOrder(record.getSortOrder());
    task.setRequirementId(record.getRequirementId());
    task.setWideTableId(record.getWideTableId());
    task.setTaskGroupId(record.getTaskGroupId());
    task.setBatchId(record.getBatchId());
    task.setRowId(record.getRowId());
    task.setIndicatorGroupId(record.getIndicatorGroupId());
    task.setIndicatorGroupName(record.getIndicatorGroupName());
    task.setName(record.getName());
    task.setSchemaVersion(record.getSchemaVersion());
    task.setExecutionMode(record.getExecutionMode());
    task.setIndicatorKeysJson(record.getIndicatorKeysJson());
    task.setDimensionValuesJson(record.getDimensionValuesJson());
    task.setRenderedPromptText(record.getRenderedPromptText());
    task.setPromptTemplateSnapshot(record.getPromptTemplateSnapshot());
    task.setBusinessDate(record.getBusinessDate());
    task.setStatus(record.getStatus());
    task.setCanRerun(record.getCanRerun());
    task.setInvalidatedReason(record.getInvalidatedReason());
    task.setOwner(record.getOwner());
    task.setConfidence(record.getConfidence());
    task.setPlanVersion(record.getPlanVersion());
    task.setRowBindingKey(record.getRowBindingKey());
    task.setCreatedAt(record.getCreatedAt());
    task.setUpdatedAt(record.getUpdatedAt());
    return task;
  }

  private static FetchTaskRecord toRecord(FetchTask task) {
    if (task == null) return null;
    FetchTaskRecord record = new FetchTaskRecord();
    record.setId(task.getId());
    record.setSortOrder(task.getSortOrder());
    record.setRequirementId(task.getRequirementId());
    record.setWideTableId(task.getWideTableId());
    record.setTaskGroupId(task.getTaskGroupId());
    record.setBatchId(task.getBatchId());
    record.setRowId(task.getRowId());
    record.setIndicatorGroupId(task.getIndicatorGroupId());
    record.setIndicatorGroupName(task.getIndicatorGroupName());
    record.setName(task.getName());
    record.setSchemaVersion(task.getSchemaVersion());
    record.setExecutionMode(task.getExecutionMode());
    record.setIndicatorKeysJson(task.getIndicatorKeysJson());
    record.setDimensionValuesJson(task.getDimensionValuesJson());
    record.setRenderedPromptText(task.getRenderedPromptText());
    record.setPromptTemplateSnapshot(task.getPromptTemplateSnapshot());
    record.setBusinessDate(task.getBusinessDate());
    record.setStatus(task.getStatus());
    record.setCanRerun(task.getCanRerun());
    record.setInvalidatedReason(task.getInvalidatedReason());
    record.setOwner(task.getOwner());
    record.setConfidence(task.getConfidence());
    record.setPlanVersion(task.getPlanVersion());
    record.setRowBindingKey(task.getRowBindingKey());
    return record;
  }
}
