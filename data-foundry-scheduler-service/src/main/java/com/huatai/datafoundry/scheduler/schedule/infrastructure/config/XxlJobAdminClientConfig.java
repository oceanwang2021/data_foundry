package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
@EnableConfigurationProperties(XxlJobProperties.class)
public class XxlJobAdminClientConfig {

  @Bean
  @Qualifier("xxlJobAdminRestTemplate")
  public RestTemplate xxlJobAdminRestTemplate(XxlJobProperties properties) {
    int timeoutSeconds = Math.max(1, properties.getTimeout());
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout((int) Duration.ofSeconds(timeoutSeconds).toMillis());
    factory.setReadTimeout((int) Duration.ofSeconds(timeoutSeconds).toMillis());

    return new RestTemplate(factory);
  }
}
