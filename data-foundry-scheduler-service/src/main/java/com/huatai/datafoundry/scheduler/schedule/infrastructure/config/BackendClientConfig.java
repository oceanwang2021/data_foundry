package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class BackendClientConfig {

  @Bean
  @Qualifier("backendRestTemplate")
  public RestTemplate backendRestTemplate() {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
    factory.setReadTimeout((int) Duration.ofSeconds(10).toMillis());
    return new RestTemplate(factory);
  }
}

