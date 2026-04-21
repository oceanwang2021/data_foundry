package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

@Configuration
public class AgentClientConfig {

  @Bean
  @Qualifier("agentRestTemplate")
  public RestTemplate agentRestTemplate() {
    // Agent-service uses default Jackson naming (camelCase). Do not reuse scheduler's SNAKE_CASE ObjectMapper.
    ObjectMapper mapper = new ObjectMapper();
    MappingJackson2HttpMessageConverter jackson = new MappingJackson2HttpMessageConverter(mapper);

    List<HttpMessageConverter<?>> converters = new ArrayList<HttpMessageConverter<?>>();
    converters.add(jackson);

    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
    factory.setReadTimeout((int) Duration.ofSeconds(10).toMillis());

    RestTemplate restTemplate = new RestTemplate(factory);
    restTemplate.setMessageConverters(converters);
    return restTemplate;
  }
}

