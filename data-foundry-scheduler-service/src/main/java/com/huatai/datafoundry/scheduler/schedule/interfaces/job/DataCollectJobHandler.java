package com.huatai.datafoundry.scheduler.schedule.interfaces.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import com.huatai.datafoundry.scheduler.schedule.application.service.XxlJobDispatchAppService;
import com.xxl.job.core.context.XxlJobHelper;
import com.xxl.job.core.handler.annotation.XxlJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class DataCollectJobHandler {
  private static final Logger log = LoggerFactory.getLogger(DataCollectJobHandler.class);

  private final ObjectMapper objectMapper;
  private final XxlJobDispatchAppService dispatchAppService;

  public DataCollectJobHandler(
      ObjectMapper objectMapper, XxlJobDispatchAppService dispatchAppService) {
    this.objectMapper = objectMapper;
    this.dispatchAppService = dispatchAppService;
  }

  @XxlJob("dataCollectJobHandler")
  public void execute() {
    String rawParam = XxlJobHelper.getJobParam();
    XxlJobHelper.log("Data collection schedule triggered, param={}", rawParam);
    log.info("XXL-JOB data collection trigger received: param={}", rawParam);

    try {
      ScheduleDispatchParam parsed = objectMapper.readValue(rawParam, ScheduleDispatchParam.class);
      ScheduleDispatchParam prepared = dispatchAppService.prepareDispatch(parsed);
      XxlJobHelper.log(
          "Schedule parameter accepted, ruleId={}, frequency={}, triggerType={}",
          prepared.getRuleId(),
          prepared.getFrequency(),
          prepared.getTriggerType());
      log.info(
          "XXL-JOB schedule parameter accepted: ruleId={}, frequency={}, triggerType={}, businessDate={}",
          prepared.getRuleId(),
          prepared.getFrequency(),
          prepared.getTriggerType(),
          prepared.getBusinessDate());
    } catch (Exception ex) {
      XxlJobHelper.log("Schedule parameter rejected, error={}", ex.getMessage());
      log.warn("XXL-JOB schedule parameter rejected: {}", ex.getMessage(), ex);
      throw new IllegalArgumentException("Invalid XXL-JOB dispatch parameter", ex);
    }
  }
}
