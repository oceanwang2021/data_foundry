package com.huatai.datafoundry.backend.schedule.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class ScheduleRuleXxlSyncStateAppServiceTest {
  private ScheduleRuleRepository repository;
  private ScheduleRuleXxlSyncStateAppService service;

  @BeforeEach
  void setUp() {
    repository = Mockito.mock(ScheduleRuleRepository.class);
    service = new ScheduleRuleXxlSyncStateAppService(repository);
  }

  @Test
  void claimsPendingRuleAndBuildsSyncCommand() {
    ScheduleRule rule = rule(true, "PENDING_SYNC");
    rule.setXxlJobId("101");
    when(repository.listPendingXxlSync(20))
        .thenReturn(Collections.singletonList(rule));
    when(repository.markXxlSyncing("rule-1")).thenReturn(1);

    List<XxlJobRuleSyncCommand> commands = service.claimPending(Integer.valueOf(20));

    assertEquals(1, commands.size());
    XxlJobRuleSyncCommand command = commands.get(0);
    assertEquals("rule-1", command.getRuleId());
    assertEquals("MONTHLY", command.getFrequency());
    assertEquals("0 30 8 * * ?", command.getCronExpression());
    assertEquals("101", command.getExistingJobId());
    assertEquals("hash-1", command.getSyncHash());
  }

  @Test
  void skipsRuleWhenAnotherWorkerAlreadyClaimedIt() {
    ScheduleRule rule = rule(true, "PENDING_SYNC");
    when(repository.listPendingXxlSync(100))
        .thenReturn(Collections.singletonList(rule));
    when(repository.markXxlSyncing("rule-1")).thenReturn(0);

    List<XxlJobRuleSyncCommand> commands = service.claimPending(null);

    assertEquals(0, commands.size());
  }

  @Test
  void appliesSuccessfulSyncResult() {
    ScheduleRule rule = rule(true, "SYNCING");
    when(repository.getById("rule-1")).thenReturn(rule);
    XxlJobRuleSyncResult result = result("SYNCED");
    result.setXxlJobId("101");
    result.setXxlJobGroup("3");
    result.setExecutorName("data-foundry-scheduler-local");
    result.setNextTriggerTime("2026-06-12T08:30:00");

    service.applyResult(result);

    verify(repository)
        .markXxlSynced(
            eq("rule-1"),
            eq("101"),
            eq("3"),
            eq("data-foundry-scheduler-local"),
            eq(LocalDateTime.of(2026, 6, 12, 8, 30)),
            any(LocalDateTime.class),
            eq("hash-1"));
  }

  @Test
  void appliesDisabledSyncResult() {
    ScheduleRule rule = rule(false, "SYNCING");
    when(repository.getById("rule-1")).thenReturn(rule);
    XxlJobRuleSyncResult result = result("DISABLED");
    result.setXxlJobId("101");

    service.applyResult(result);

    verify(repository)
        .markXxlDisabled(
            eq("rule-1"),
            eq("101"),
            eq(null),
            eq(null),
            any(LocalDateTime.class),
            eq("hash-1"));
  }

  @Test
  void appliesFailedSyncResult() {
    ScheduleRule rule = rule(true, "SYNCING");
    when(repository.getById("rule-1")).thenReturn(rule);
    XxlJobRuleSyncResult result = result("SYNC_FAILED");
    result.setErrorMessage("Admin unavailable");

    service.applyResult(result);

    verify(repository)
        .markXxlSyncFailed(
            eq("rule-1"), any(LocalDateTime.class), eq("Admin unavailable"));
  }

  @Test
  void rejectsStaleSyncResult() {
    ScheduleRule rule = rule(true, "SYNCING");
    rule.setXxlSyncHash("new-hash");
    when(repository.getById("rule-1")).thenReturn(rule);
    XxlJobRuleSyncResult result = result("SYNCED");
    result.setXxlJobId("101");

    IllegalStateException error =
        assertThrows(IllegalStateException.class, () -> service.applyResult(result));

    assertEquals(
        "Stale XXL-JOB sync result for schedule rule: rule-1",
        error.getMessage());
    verify(repository, never())
        .markXxlSynced(any(), any(), any(), any(), any(), any(), any());
  }

  private static ScheduleRule rule(boolean enabled, String syncStatus) {
    ScheduleRule rule = new ScheduleRule();
    rule.setId("rule-1");
    rule.setRuleName("Monthly collection");
    rule.setRuleCode("schedule:rule-1");
    rule.setFrequency("MONTHLY");
    rule.setCronExpression("0 30 8 * * ?");
    rule.setBusinessDateMode("PREVIOUS_PERIOD");
    rule.setBusinessDateOffsetDays(Integer.valueOf(3));
    rule.setTriggerTime(LocalTime.of(8, 30));
    rule.setXxlJobHandler("dataCollectJobHandler");
    rule.setEnabled(Boolean.valueOf(enabled));
    rule.setXxlSyncStatus(syncStatus);
    rule.setXxlSyncHash("hash-1");
    return rule;
  }

  private static XxlJobRuleSyncResult result(String status) {
    XxlJobRuleSyncResult result = new XxlJobRuleSyncResult();
    result.setRuleId("rule-1");
    result.setStatus(status);
    result.setSyncHash("hash-1");
    return result;
  }
}
