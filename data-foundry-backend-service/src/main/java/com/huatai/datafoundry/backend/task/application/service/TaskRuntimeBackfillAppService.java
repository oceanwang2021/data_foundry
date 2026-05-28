package com.huatai.datafoundry.backend.task.application.service;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableRowMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableRowRecord;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskRuntimeBackfillAppService {
  private final FetchTaskRepository fetchTaskRepository;
  private final TaskGroupRepository taskGroupRepository;
  private final WideTableRowMapper wideTableRowMapper;
  private final TaskGroupAggregateService taskGroupAggregateService;

  public TaskRuntimeBackfillAppService(
      FetchTaskRepository fetchTaskRepository,
      TaskGroupRepository taskGroupRepository,
      WideTableRowMapper wideTableRowMapper,
      TaskGroupAggregateService taskGroupAggregateService) {
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskGroupRepository = taskGroupRepository;
    this.wideTableRowMapper = wideTableRowMapper;
    this.taskGroupAggregateService = taskGroupAggregateService;
  }

  @Transactional
  public Map<String, Object> backfillRuntimeData() {
    List<FetchTask> tasks = fetchTaskRepository.listAll();
    List<FetchTask> patchedTasks = new ArrayList<FetchTask>();
    int dimensionValuesBackfilled = 0;
    int businessDatesBackfilled = 0;
    int rowBindingKeysBackfilled = 0;

    if (tasks != null) {
      for (FetchTask task : tasks) {
        if (task == null || isBlank(task.getWideTableId())) {
          continue;
        }
        WideTableRowRecord rowRecord = findMatchingRow(task);
        if (rowRecord == null) {
          continue;
        }
        boolean changed = false;
        if (isBlank(task.getDimensionValuesJson()) && !isBlank(rowRecord.getDimensionValuesJson())) {
          task.setDimensionValuesJson(rowRecord.getDimensionValuesJson());
          dimensionValuesBackfilled++;
          changed = true;
        }
        if (isBlank(task.getBusinessDate()) && !isBlank(rowRecord.getBusinessDate())) {
          task.setBusinessDate(rowRecord.getBusinessDate());
          businessDatesBackfilled++;
          changed = true;
        }
        if (isBlank(task.getRowBindingKey()) && !isBlank(rowRecord.getRowBindingKey())) {
          task.setRowBindingKey(rowRecord.getRowBindingKey());
          rowBindingKeysBackfilled++;
          changed = true;
        }
        if (changed) {
          patchedTasks.add(task);
        }
      }
    }

    if (!patchedTasks.isEmpty()) {
      fetchTaskRepository.upsertBatch(patchedTasks);
    }

    List<TaskGroup> taskGroups = taskGroupRepository.listAll();
    List<String> taskGroupIds = new ArrayList<String>();
    if (taskGroups != null) {
      for (TaskGroup taskGroup : taskGroups) {
        if (taskGroup != null && !isBlank(taskGroup.getId())) {
          taskGroupIds.add(taskGroup.getId());
        }
      }
    }
    taskGroupAggregateService.refreshTaskGroups(taskGroupIds);

    Map<String, Object> result = new HashMap<String, Object>();
    result.put("ok", Boolean.TRUE);
    result.put("fetch_tasks_scanned", tasks != null ? tasks.size() : 0);
    result.put("fetch_tasks_patched", patchedTasks.size());
    result.put("dimension_values_backfilled", dimensionValuesBackfilled);
    result.put("business_dates_backfilled", businessDatesBackfilled);
    result.put("row_binding_keys_backfilled", rowBindingKeysBackfilled);
    result.put("task_groups_refreshed", taskGroupIds.size());
    return result;
  }

  private WideTableRowRecord findMatchingRow(FetchTask task) {
    if (!isBlank(task.getRowBindingKey())) {
      WideTableRowRecord record =
          wideTableRowMapper.getByRowBindingKey(task.getWideTableId(), task.getRowBindingKey());
      if (record != null) {
        return record;
      }
    }
    if (task.getRowId() != null) {
      return wideTableRowMapper.getById(task.getWideTableId(), task.getRowId());
    }
    return null;
  }

  private boolean isBlank(String value) {
    return value == null || value.trim().isEmpty();
  }
}
