package com.huatai.datafoundry.backend.schedule.application.service;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduleRuleXxlSyncStateAppService {
  private static final int DEFAULT_BATCH_SIZE = 100;
  private static final int MAX_BATCH_SIZE = 500;
  private static final int MAX_ERROR_LENGTH = 2000;

  private final ScheduleRuleRepository repository;

  public ScheduleRuleXxlSyncStateAppService(ScheduleRuleRepository repository) {
    this.repository = repository;
  }

  @Transactional
  public List<XxlJobRuleSyncCommand> claimPending(Integer requestedLimit) {
    int limit = normalizeLimit(requestedLimit);
    List<ScheduleRule> candidates = repository.listPendingXxlSync(limit);
    return claim(candidates);
  }

  @Transactional
  public List<XxlJobRuleSyncCommand> claimWideTable(
      String requirementId, String wideTableId) {
    List<ScheduleRule> candidates =
        repository.listByWideTable(
            requireText(requirementId, "requirementId is required"),
            requireText(wideTableId, "wideTableId is required"));
    List<ScheduleRule> pending = new ArrayList<ScheduleRule>();
    if (candidates != null) {
      for (ScheduleRule rule : candidates) {
        if (rule != null && isPending(rule.getXxlSyncStatus())) {
          pending.add(rule);
        }
      }
    }
    return claim(pending);
  }

  @Transactional
  public void applyResult(XxlJobRuleSyncResult result) {
    if (result == null) {
      throw new IllegalArgumentException("XXL-JOB sync result is required");
    }
    String ruleId = requireText(result.getRuleId(), "ruleId is required");
    ScheduleRule rule = repository.getById(ruleId);
    if (rule == null) {
      throw new IllegalArgumentException("Schedule rule not found: " + ruleId);
    }
    assertCurrentHash(rule, result.getSyncHash());

    LocalDateTime syncTime = LocalDateTime.now();
    String status = requireText(result.getStatus(), "sync status is required")
        .toUpperCase(Locale.ROOT);
    if ("SYNCED".equals(status)) {
      repository.markXxlSynced(
          ruleId,
          requireText(result.getXxlJobId(), "xxlJobId is required for SYNCED"),
          result.getXxlJobGroup(),
          result.getExecutorName(),
          parseDateTime(result.getNextTriggerTime()),
          syncTime,
          rule.getXxlSyncHash());
      return;
    }
    if ("DISABLED".equals(status)) {
      repository.markXxlDisabled(
          ruleId,
          result.getXxlJobId(),
          result.getXxlJobGroup(),
          result.getExecutorName(),
          syncTime,
          rule.getXxlSyncHash());
      return;
    }
    if ("SYNC_FAILED".equals(status) || "FAILED".equals(status)) {
      repository.markXxlSyncFailed(
          ruleId, syncTime, truncate(result.getErrorMessage()));
      return;
    }
    throw new IllegalArgumentException("Unsupported XXL-JOB sync status: " + status);
  }

  private List<XxlJobRuleSyncCommand> claim(List<ScheduleRule> candidates) {
    List<XxlJobRuleSyncCommand> commands = new ArrayList<XxlJobRuleSyncCommand>();
    if (candidates == null) {
      return commands;
    }
    for (ScheduleRule rule : candidates) {
      if (rule == null || rule.getId() == null) {
        continue;
      }
      if (repository.markXxlSyncing(rule.getId()) == 1) {
        commands.add(toCommand(rule));
      }
    }
    return commands;
  }

  private static XxlJobRuleSyncCommand toCommand(ScheduleRule rule) {
    XxlJobRuleSyncCommand command = new XxlJobRuleSyncCommand();
    command.setRuleId(rule.getId());
    command.setRuleName(rule.getRuleName());
    command.setRuleCode(rule.getRuleCode());
    command.setFrequency(rule.getFrequency());
    command.setCronExpression(rule.getCronExpression());
    command.setBusinessDateMode(rule.getBusinessDateMode());
    command.setBusinessDateOffsetDays(rule.getBusinessDateOffsetDays());
    command.setTriggerTime(
        rule.getTriggerTime() != null ? rule.getTriggerTime().toString() : null);
    command.setJobHandler(rule.getXxlJobHandler());
    command.setEnabled(rule.getEnabled());
    command.setExistingJobId(rule.getXxlJobId());
    command.setExistingJobGroup(rule.getXxlJobGroup());
    command.setExistingExecutorName(rule.getXxlExecutorName());
    command.setSyncHash(rule.getXxlSyncHash());
    return command;
  }

  private static boolean isPending(String status) {
    return status == null
        || "PENDING_SYNC".equalsIgnoreCase(status)
        || "SYNC_FAILED".equalsIgnoreCase(status);
  }

  private static void assertCurrentHash(ScheduleRule rule, String resultHash) {
    String currentHash = trimToNull(rule.getXxlSyncHash());
    String normalizedResultHash = trimToNull(resultHash);
    if (currentHash != null && !currentHash.equals(normalizedResultHash)) {
      throw new IllegalStateException(
          "Stale XXL-JOB sync result for schedule rule: " + rule.getId());
    }
  }

  private static LocalDateTime parseDateTime(String value) {
    String normalized = trimToNull(value);
    return normalized != null ? LocalDateTime.parse(normalized) : null;
  }

  private static int normalizeLimit(Integer requestedLimit) {
    if (requestedLimit == null || requestedLimit.intValue() <= 0) {
      return DEFAULT_BATCH_SIZE;
    }
    return Math.min(requestedLimit.intValue(), MAX_BATCH_SIZE);
  }

  private static String requireText(String value, String message) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      throw new IllegalArgumentException(message);
    }
    return normalized;
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private static String truncate(String value) {
    if (value == null || value.length() <= MAX_ERROR_LENGTH) {
      return value;
    }
    return value.substring(0, MAX_ERROR_LENGTH);
  }
}
