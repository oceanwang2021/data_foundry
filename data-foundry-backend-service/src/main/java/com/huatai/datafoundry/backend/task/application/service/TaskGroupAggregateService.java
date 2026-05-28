package com.huatai.datafoundry.backend.task.application.service;

import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.model.TaskStatus;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class TaskGroupAggregateService {
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;

  public TaskGroupAggregateService(
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository) {
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
  }

  public TaskGroup refreshTaskGroup(String taskGroupId) {
    if (taskGroupId == null || taskGroupId.trim().isEmpty()) {
      return null;
    }
    TaskGroup taskGroup = taskGroupRepository.getById(taskGroupId.trim());
    if (taskGroup == null) {
      return null;
    }
    return recomputeAndPersist(taskGroup);
  }

  public List<TaskGroup> refreshTaskGroups(List<String> taskGroupIds) {
    if (taskGroupIds == null || taskGroupIds.isEmpty()) {
      return Collections.emptyList();
    }
    Set<String> dedupedTaskGroupIds = new LinkedHashSet<String>();
    for (String taskGroupId : taskGroupIds) {
      if (taskGroupId != null && !taskGroupId.trim().isEmpty()) {
        dedupedTaskGroupIds.add(taskGroupId.trim());
      }
    }
    if (dedupedTaskGroupIds.isEmpty()) {
      return Collections.emptyList();
    }
    List<TaskGroup> refreshed = new ArrayList<TaskGroup>(dedupedTaskGroupIds.size());
    for (String taskGroupId : dedupedTaskGroupIds) {
      TaskGroup taskGroup = taskGroupRepository.getById(taskGroupId);
      if (taskGroup == null) {
        continue;
      }
      refreshed.add(recomputeAndPersist(taskGroup));
    }
    return refreshed;
  }

  private TaskGroup recomputeAndPersist(TaskGroup taskGroup) {
    List<FetchTask> tasks = fetchTaskRepository.listByTaskGroup(taskGroup.getId());
    int existingTotal = safeInt(taskGroup.getTotalTasks());
    int totalTasks = (tasks == null || tasks.isEmpty()) ? existingTotal : tasks.size();
    int pendingTasks = 0;
    int runningTasks = 0;
    int completedTasks = 0;
    int failedTasks = 0;
    int cancelledTasks = 0;
    int invalidatedTasks = 0;
    if (tasks != null) {
      for (FetchTask task : tasks) {
        String status = normalize(task != null ? task.getStatus() : null);
        if (TaskStatus.RUNNING.equals(status)) {
          runningTasks++;
        } else if (TaskStatus.COMPLETED.equals(status)) {
          completedTasks++;
        } else if (TaskStatus.FAILED.equals(status)) {
          failedTasks++;
        } else if (TaskStatus.CANCELLED.equals(status)) {
          cancelledTasks++;
        } else if (TaskStatus.INVALIDATED.equals(status)) {
          invalidatedTasks++;
        } else {
          pendingTasks++;
        }
      }
    }
    if (tasks == null || tasks.isEmpty()) {
      pendingTasks = Math.max(totalTasks, 0);
    } else {
      pendingTasks = Math.max(totalTasks - runningTasks - completedTasks - failedTasks - cancelledTasks - invalidatedTasks, 0);
    }
    taskGroup.setTotalTasks(Integer.valueOf(totalTasks));
    taskGroup.setPendingTasks(Integer.valueOf(pendingTasks));
    taskGroup.setRunningTasks(Integer.valueOf(runningTasks));
    taskGroup.setCompletedTasks(Integer.valueOf(completedTasks));
    taskGroup.setFailedTasks(Integer.valueOf(failedTasks));
    taskGroup.setCancelledTasks(Integer.valueOf(cancelledTasks));
    taskGroup.setInvalidatedTasks(Integer.valueOf(invalidatedTasks));
    taskGroup.setStatus(resolveTaskGroupStatus(
        totalTasks,
        pendingTasks,
        runningTasks,
        completedTasks,
        failedTasks,
        cancelledTasks,
        invalidatedTasks));
    taskGroup.setLastAggregatedAt(LocalDateTime.now());
    taskGroupRepository.upsert(taskGroup);
    return taskGroup;
  }

  private String resolveTaskGroupStatus(
      int totalTasks,
      int pendingTasks,
      int runningTasks,
      int completedTasks,
      int failedTasks,
      int cancelledTasks,
      int invalidatedTasks) {
    if (totalTasks <= 0) {
      return TaskStatus.PENDING;
    }
    if (runningTasks > 0) {
      return TaskStatus.RUNNING;
    }
    if (pendingTasks > 0) {
      return (completedTasks > 0 || failedTasks > 0 || cancelledTasks > 0 || invalidatedTasks > 0)
          ? TaskStatus.RUNNING
          : TaskStatus.PENDING;
    }
    if (invalidatedTasks == totalTasks) {
      return TaskStatus.INVALIDATED;
    }
    if (failedTasks == totalTasks) {
      return TaskStatus.FAILED;
    }
    if (cancelledTasks == totalTasks) {
      return TaskStatus.CANCELLED;
    }
    if (completedTasks == totalTasks) {
      return TaskStatus.COMPLETED;
    }
    if (completedTasks > 0 || failedTasks > 0 || cancelledTasks > 0 || invalidatedTasks > 0) {
      return "partial";
    }
    return TaskStatus.PENDING;
  }

  private int safeInt(Integer value) {
    return value != null ? value.intValue() : 0;
  }

  private String normalize(String raw) {
    if (raw == null) {
      return null;
    }
    String normalized = raw.trim().toLowerCase();
    return normalized.isEmpty() ? null : normalized;
  }
}
