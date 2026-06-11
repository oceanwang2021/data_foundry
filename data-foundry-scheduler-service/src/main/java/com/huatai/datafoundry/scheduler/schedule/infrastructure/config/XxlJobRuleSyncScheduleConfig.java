package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import com.huatai.datafoundry.scheduler.schedule.application.service.XxlJobRuleSyncAppService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@ConditionalOnProperty(prefix = "xxl.job.sync", name = "enabled", havingValue = "true")
public class XxlJobRuleSyncScheduleConfig {
  private static final Logger log = LoggerFactory.getLogger(XxlJobRuleSyncScheduleConfig.class);

  private final XxlJobRuleSyncAppService syncAppService;
  private final XxlJobProperties properties;

  public XxlJobRuleSyncScheduleConfig(
      XxlJobRuleSyncAppService syncAppService, XxlJobProperties properties) {
    this.syncAppService = syncAppService;
    this.properties = properties;
  }

  @Scheduled(
      fixedDelayString = "${xxl.job.sync.fixed-delay-ms:30000}",
      initialDelayString = "${xxl.job.sync.initial-delay-ms:10000}")
  public void synchronizePendingRules() {
    try {
      int processed = syncAppService.synchronizePending(properties.getSync().getBatchSize());
      if (processed > 0) {
        log.info("XXL-JOB rule synchronization completed: processed={}", processed);
      }
    } catch (Exception ex) {
      log.warn("XXL-JOB rule synchronization cycle failed: {}", ex.getMessage(), ex);
    }
  }
}
