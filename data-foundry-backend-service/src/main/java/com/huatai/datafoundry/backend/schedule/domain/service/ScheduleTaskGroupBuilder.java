package com.huatai.datafoundry.backend.schedule.domain.service;

import com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ScheduleTaskGroupBuilder {
  public TaskGroup build(
      ScheduleRule rule, ScheduleRuleDispatchCommand command, String businessDate) {
    TaskGroup group = new TaskGroup();
    group.setId(stableId(rule.getId(), businessDate));
    group.setSortOrder(0);
    group.setRequirementId(rule.getRequirementId());
    group.setWideTableId(rule.getWideTableId());
    group.setBatchId(group.getId());
    group.setBusinessDate(businessDate);
    group.setFrequency(upper(firstNonBlank(command.getFrequency(), rule.getFrequency())));
    group.setSourceType(upper(firstNonBlank(command.getTriggerType(), "SCHEDULE")));
    group.setStatus("pending");
    group.setScheduleRuleId(rule.getId());
    group.setIndicatorGroupId(rule.getIndicatorGroupId());
    group.setPlanVersion(1);
    group.setGroupKind("scheduled");
    group.setPartitionType("indicator_group");
    group.setPartitionKey(rule.getIndicatorGroupId());
    group.setPartitionLabel(rule.getRuleName());
    group.setTotalTasks(0);
    group.setPendingTasks(0);
    group.setRunningTasks(0);
    group.setCompletedTasks(0);
    group.setFailedTasks(0);
    group.setCancelledTasks(0);
    group.setInvalidatedTasks(0);
    group.setTriggeredBy(firstNonBlank(command.getOperator(), "system"));
    return group;
  }

  private static String stableId(String ruleId, String businessDate) {
    UUID uuid =
        UUID.nameUUIDFromBytes(
            ("schedule-rule:" + ruleId + ":" + businessDate).getBytes(StandardCharsets.UTF_8));
    return "tg_sr_" + uuid.toString().replace("-", "");
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }

  private static String upper(String value) {
    return value != null ? value.toUpperCase() : null;
  }
}
