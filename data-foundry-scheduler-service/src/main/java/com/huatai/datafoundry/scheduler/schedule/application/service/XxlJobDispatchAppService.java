package com.huatai.datafoundry.scheduler.schedule.application.service;

import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import com.huatai.datafoundry.scheduler.schedule.application.dto.DispatchScheduleRuleCommand;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import com.huatai.datafoundry.scheduler.schedule.domain.repository.ScheduleJobRepository;
import com.huatai.datafoundry.contract.scheduler.ScheduleFrequency;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class XxlJobDispatchAppService {
  private final BackendGateway backendGateway;
  private final ScheduleJobRepository scheduleJobRepository;

  public XxlJobDispatchAppService(
      BackendGateway backendGateway, ScheduleJobRepository scheduleJobRepository) {
    this.backendGateway = backendGateway;
    this.scheduleJobRepository = scheduleJobRepository;
  }

  public ScheduleDispatchParam prepareDispatch(ScheduleDispatchParam param) {
    if (param == null) {
      throw new IllegalArgumentException("XXL-JOB dispatch parameter is required");
    }

    param.setRuleId(requireText(param.getRuleId(), "ruleId is required"));
    ScheduleFrequency frequency =
        ScheduleFrequency.parse(defaultValue(param.getFrequency(), "MONTHLY"));
    param.setFrequency(frequency.name());
    param.setTriggerType(defaultValue(param.getTriggerType(), "SCHEDULE").toUpperCase());
    String businessDate = trimToNull(param.getBusinessDate());
    param.setBusinessDate(
        businessDate != null ? frequency.normalizeBusinessDate(businessDate) : null);
    String businessDateMode =
        defaultValue(param.getBusinessDateMode(), "PREVIOUS_PERIOD").toUpperCase();
    if (!"CURRENT_PERIOD".equals(businessDateMode)
        && !"PREVIOUS_PERIOD".equals(businessDateMode)) {
      throw new IllegalArgumentException(
          "Unsupported businessDateMode: " + businessDateMode);
    }
    param.setBusinessDateMode(businessDateMode);
    param.setOperator(defaultValue(param.getOperator(), "system"));
    return param;
  }

  public Map<String, Object> dispatch(
      ScheduleDispatchParam param,
      String rawJobParam,
      String xxlJobId,
      String idempotencyKey) {
    ScheduleDispatchParam prepared = prepareDispatch(param);
    String scheduleJobId = resolveScheduleJobId(idempotencyKey);
    ensureRunningRecord(
        scheduleJobId, prepared, rawJobParam, xxlJobId);

    DispatchScheduleRuleCommand command = new DispatchScheduleRuleCommand();
    command.setTriggerType(prepared.getTriggerType());
    command.setTriggerSource("XXL_JOB");
    command.setFrequency(prepared.getFrequency());
    command.setBusinessDate(prepared.getBusinessDate());
    command.setBusinessDateMode(prepared.getBusinessDateMode());
    command.setScheduleJobId(scheduleJobId);
    command.setXxlJobParam(rawJobParam);
    command.setOperator(prepared.getOperator());
    Map<String, Object> result;
    try {
      result = backendGateway.dispatchScheduleRule(prepared.getRuleId(), command, idempotencyKey);
    } catch (RuntimeException ex) {
      scheduleJobRepository.updateDispatchResult(
          scheduleJobId,
          null,
          prepared.getBusinessDate(),
          "FAILED",
          Instant.now().toString(),
          truncate(ex.getMessage()));
      throw ex;
    }

    String backendStatus = text(result != null ? result.get("status") : null);
    String localStatus = mapDispatchStatus(backendStatus);
    String taskGroupId = text(result != null ? result.get("task_group_id") : null);
    String businessDate =
        firstNonBlank(
            text(result != null ? result.get("business_date") : null),
            prepared.getBusinessDate());
    String errorMessage =
        "FAILED".equals(localStatus)
            ? "Backend returned dispatch status " + backendStatus
            : null;
    scheduleJobRepository.updateDispatchResult(
        scheduleJobId,
        taskGroupId,
        businessDate,
        localStatus,
        Instant.now().toString(),
        errorMessage);
    if ("FAILED".equals(localStatus)) {
      throw new IllegalStateException(errorMessage);
    }
    return result != null ? result : new HashMap<String, Object>();
  }

  private void ensureRunningRecord(
      String scheduleJobId,
      ScheduleDispatchParam param,
      String rawJobParam,
      String xxlJobId) {
    if (scheduleJobRepository.get(scheduleJobId) != null) {
      return;
    }
    ScheduleJob record = new ScheduleJob();
    record.setId(scheduleJobId);
    record.setJobSource("RULE_DISPATCH");
    record.setScheduleRuleId(param.getRuleId());
    record.setBusinessDate(param.getBusinessDate());
    record.setRequestPayload(rawJobParam);
    record.setTriggerType(param.getTriggerType());
    record.setStatus("RUNNING");
    record.setStartedAt(Instant.now().toString());
    record.setOperator(param.getOperator());
    record.setLogRef(
        xxlJobId != null && !xxlJobId.trim().isEmpty()
            ? "xxl-job://" + xxlJobId.trim()
            : "xxl-job://" + scheduleJobId);
    scheduleJobRepository.insert(record);
  }

  private static String mapDispatchStatus(String status) {
    if (status == null) return "FAILED";
    String normalized = status.trim().toUpperCase();
    if ("DISPATCHED".equals(normalized)) return "DISPATCHED";
    if (normalized.startsWith("SKIPPED")) return "SKIPPED";
    return "FAILED";
  }

  private static String resolveScheduleJobId(String idempotencyKey) {
    String key =
        idempotencyKey != null && !idempotencyKey.trim().isEmpty()
            ? idempotencyKey.trim()
            : UUID.randomUUID().toString();
    UUID uuid =
        UUID.nameUUIDFromBytes(
            ("rule-dispatch:" + key).getBytes(StandardCharsets.UTF_8));
    return uuid.toString();
  }

  private static String requireText(String value, String message) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      throw new IllegalArgumentException(message);
    }
    return normalized;
  }

  private static String defaultValue(String value, String defaultValue) {
    String normalized = trimToNull(value);
    return normalized != null ? normalized : defaultValue;
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    return normalized.length() > 0 ? normalized : null;
  }

  private static String text(Object value) {
    return value != null ? trimToNull(String.valueOf(value)) : null;
  }

  private static String firstNonBlank(String first, String second) {
    String normalized = trimToNull(first);
    return normalized != null ? normalized : trimToNull(second);
  }

  private static String truncate(String value) {
    if (value == null || value.length() <= 2000) return value;
    return value.substring(0, 2000);
  }
}
