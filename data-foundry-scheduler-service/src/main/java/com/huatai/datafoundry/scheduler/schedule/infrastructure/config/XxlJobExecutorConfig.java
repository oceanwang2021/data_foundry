package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import com.xxl.job.core.executor.impl.XxlJobSpringExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(XxlJobProperties.class)
@ConditionalOnProperty(
    prefix = "xxl.job.executor",
    name = "enabled",
    havingValue = "true")
public class XxlJobExecutorConfig {
  private static final Logger log = LoggerFactory.getLogger(XxlJobExecutorConfig.class);

  @Bean
  public XxlJobSpringExecutor xxlJobExecutor(XxlJobProperties properties) {
    XxlJobProperties.Executor executorProperties = properties.getExecutor();
    log.info(
        "Initializing XXL-JOB executor: appname={}, adminAddresses={}, port={}",
        executorProperties.getAppname(),
        properties.getAdmin().getAddresses(),
        executorProperties.getPort());

    XxlJobSpringExecutor executor = new XxlJobSpringExecutor();
    executor.setAdminAddresses(properties.getAdmin().getAddresses());
    executor.setAccessToken(properties.getAccessToken());
    executor.setAppname(executorProperties.getAppname());
    executor.setAddress(executorProperties.getAddress());
    executor.setIp(executorProperties.getIp());
    executor.setPort(executorProperties.getPort());
    executor.setLogPath(executorProperties.getLogpath());
    executor.setLogRetentionDays(executorProperties.getLogretentiondays());
    return executor;
  }
}
