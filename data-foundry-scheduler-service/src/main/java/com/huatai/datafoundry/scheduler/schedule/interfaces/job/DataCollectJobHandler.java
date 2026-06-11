package com.huatai.datafoundry.scheduler.schedule.interfaces.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam;
import com.huatai.datafoundry.scheduler.schedule.application.service.XxlJobDispatchAppService;
import com.xxl.job.core.context.XxlJobHelper;
import com.xxl.job.core.handler.annotation.XxlJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.util.Map;

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
      String scheduleJobId = String.valueOf(XxlJobHelper.getJobId());
      String idempotencyKey =
          "xxl-job:" + XxlJobHelper.getJobId() + ":" + XxlJobHelper.getJobLogFileName();
      Map<String, Object> result =
          dispatchAppService.dispatch(parsed, rawParam, scheduleJobId, idempotencyKey);
      XxlJobHelper.log(
          "Schedule dispatch completed, ruleId={}, status={}, taskGroupId={}, businessDate={}",
          parsed.getRuleId(),
          result.get("status"),
          result.get("task_group_id"),
          result.get("business_date"));
      log.info(
          "XXL-JOB schedule dispatch completed: ruleId={}, status={}, taskGroupId={}, businessDate={}",
          parsed.getRuleId(),
          result.get("status"),
          result.get("task_group_id"),
          result.get("business_date"));
    } catch (Exception ex) {
      XxlJobHelper.log("Schedule dispatch failed, error={}", ex.getMessage());
      log.warn("XXL-JOB schedule dispatch failed: {}", ex.getMessage(), ex);
      throw new IllegalStateException("XXL-JOB schedule dispatch failed: " + ex.getMessage(), ex);
    }
  }
}
