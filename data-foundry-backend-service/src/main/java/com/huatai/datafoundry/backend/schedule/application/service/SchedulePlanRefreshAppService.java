package com.huatai.datafoundry.backend.schedule.application.service;

import com.huatai.datafoundry.backend.requirement.domain.model.WideTable;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.schedule.domain.service.SchedulePlanningTimeCalculator;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class SchedulePlanRefreshAppService {
  private final ScheduleRuleSyncAppService scheduleRuleSyncAppService;
  private final SchedulePlanningTimeCalculator schedulePlanningTimeCalculator;
  private final TaskGroupRepository taskGroupRepository;

  public SchedulePlanRefreshAppService(
      ScheduleRuleSyncAppService scheduleRuleSyncAppService,
      SchedulePlanningTimeCalculator schedulePlanningTimeCalculator,
      TaskGroupRepository taskGroupRepository) {
    this.scheduleRuleSyncAppService = scheduleRuleSyncAppService;
    this.schedulePlanningTimeCalculator = schedulePlanningTimeCalculator;
    this.taskGroupRepository = taskGroupRepository;
  }

  public int refresh(WideTable wideTable) {
    if (wideTable == null) {
      return 0;
    }

    Map<String, ScheduleRule> rulesByIndicatorGroup =
        scheduleRuleSyncAppService.sync(toPlanSource(wideTable));
    if (rulesByIndicatorGroup.isEmpty()) {
      return 0;
    }

    List<TaskGroup> taskGroups =
        taskGroupRepository.listByRequirementAndWideTable(
            wideTable.getRequirementId(), wideTable.getId());
    if (taskGroups == null || taskGroups.isEmpty()) {
      return 0;
    }
    int updated = 0;
    for (TaskGroup taskGroup : taskGroups) {
      if (!isPendingScheduledTaskGroup(taskGroup)) {
        continue;
      }
      ScheduleRule rule = resolveRule(taskGroup, rulesByIndicatorGroup);
      if (rule == null) {
        continue;
      }
      LocalDateTime scheduledAt =
          schedulePlanningTimeCalculator.calculate(
              rule.getFrequency(),
              taskGroup.getBusinessDate(),
              rule.getBusinessDateOffsetDays(),
              rule.getTriggerTime());
      updated +=
          taskGroupRepository.updatePendingSchedule(
              taskGroup.getId(), rule.getId(), scheduledAt);
    }
    return updated;
  }

  private static boolean isPendingScheduledTaskGroup(TaskGroup taskGroup) {
    return taskGroup != null
        && "pending".equalsIgnoreCase(taskGroup.getStatus())
        && "scheduled".equalsIgnoreCase(taskGroup.getSourceType())
        && taskGroup.getBusinessDate() != null
        && !taskGroup.getBusinessDate().trim().isEmpty();
  }

  private static ScheduleRule resolveRule(
      TaskGroup taskGroup, Map<String, ScheduleRule> rulesByIndicatorGroup) {
    ScheduleRule rule = rulesByIndicatorGroup.get(taskGroup.getIndicatorGroupId());
    if (rule == null && rulesByIndicatorGroup.size() == 1) {
      return rulesByIndicatorGroup.values().iterator().next();
    }
    return rule;
  }

  private static WideTablePlanSource toPlanSource(WideTable wideTable) {
    WideTablePlanSource source = new WideTablePlanSource();
    source.setId(wideTable.getId());
    source.setRequirementId(wideTable.getRequirementId());
    source.setSchemaVersion(wideTable.getSchemaVersion());
    source.setSchemaJson(wideTable.getSchemaJson());
    source.setScopeJson(wideTable.getScopeJson());
    source.setIndicatorGroupsJson(wideTable.getIndicatorGroupsJson());
    source.setScheduleRulesJson(wideTable.getScheduleRulesJson());
    source.setSemanticTimeAxis(wideTable.getSemanticTimeAxis());
    source.setCollectionCoverageMode(wideTable.getCollectionCoverageMode());
    return source;
  }
}
