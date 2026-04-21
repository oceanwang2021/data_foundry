package com.huatai.datafoundry.backend.task.infrastructure.config;

import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({TaskExecutionProperties.class, InternalCallbackProperties.class})
public class TaskDomainServiceConfig {

  @Bean
  public TaskPlanDomainService taskPlanDomainService() {
    return new TaskPlanDomainService();
  }
}
