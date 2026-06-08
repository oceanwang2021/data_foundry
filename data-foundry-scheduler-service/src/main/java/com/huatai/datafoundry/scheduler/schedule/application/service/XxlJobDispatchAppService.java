package com.huatai.datafoundry.scheduler.schedule.application.service;

import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import org.springframework.stereotype.Service;

@Service
public class XxlJobDispatchAppService {

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
