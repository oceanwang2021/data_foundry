package com.huatai.datafoundry.scheduler.schedule.application.service;

import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import com.huatai.datafoundry.scheduler.schedule.application.dto.DispatchScheduleRuleCommand;
import com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class XxlJobDispatchAppService {
  private final BackendGateway backendGateway;

  public XxlJobDispatchAppService(BackendGateway backendGateway) {
    this.backendGateway = backendGateway;
  }

  public ScheduleDispatchParam prepareDispatch(ScheduleDispatchParam param) {
    if (param == null) {
      throw new IllegalArgumentException("XXL-JOB dispatch parameter is required");
    }

    param.setRuleId(requireText(param.getRuleId(), "ruleId is required"));
    param.setFrequency(defaultValue(param.getFrequency(), "MONTHLY").toUpperCase());
    param.setTriggerType(defaultValue(param.getTriggerType(), "SCHEDULE").toUpperCase());
    param.setBusinessDate(trimToNull(param.getBusinessDate()));
    param.setBusinessDateMode(
        defaultValue(param.getBusinessDateMode(), "PREVIOUS_PERIOD").toUpperCase());
    param.setOperator(defaultValue(param.getOperator(), "system"));
    return param;
  }

  public Map<String, Object> dispatch(
      ScheduleDispatchParam param,
      String rawJobParam,
      String scheduleJobId,
      String idempotencyKey) {
    ScheduleDispatchParam prepared = prepareDispatch(param);
    DispatchScheduleRuleCommand command = new DispatchScheduleRuleCommand();
    command.setTriggerType(prepared.getTriggerType());
    command.setTriggerSource("XXL_JOB");
    command.setFrequency(prepared.getFrequency());
    command.setBusinessDate(prepared.getBusinessDate());
    command.setBusinessDateMode(prepared.getBusinessDateMode());
    command.setScheduleJobId(scheduleJobId);
    command.setXxlJobParam(rawJobParam);
    command.setOperator(prepared.getOperator());
    return backendGateway.dispatchScheduleRule(prepared.getRuleId(), command, idempotencyKey);
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
}
