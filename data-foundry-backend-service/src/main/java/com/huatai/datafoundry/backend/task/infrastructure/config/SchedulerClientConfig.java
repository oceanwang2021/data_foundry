package com.huatai.datafoundry.backend.task.infrastructure.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class SchedulerClientConfig {

  @Bean
  @Qualifier("schedulerRestTemplate")
  public RestTemplate schedulerRestTemplate(RestTemplateBuilder builder) {
    // For scheduler calls: fail fast and retry at caller.
    return builder
        .setConnectTimeout(Duration.ofSeconds(2))
        .setReadTimeout(Duration.ofSeconds(5))
        .build();
  }
}

