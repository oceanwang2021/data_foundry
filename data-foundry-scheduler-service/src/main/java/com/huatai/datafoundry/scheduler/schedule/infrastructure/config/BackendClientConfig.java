package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestTemplate;

@Configuration
public class BackendClientConfig {

  @Bean
  @Qualifier("backendRestTemplate")
  public RestTemplate backendRestTemplate() {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
    factory.setReadTimeout((int) Duration.ofSeconds(10).toMillis());

    ObjectMapper mapper = new ObjectMapper();
    mapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    MappingJackson2HttpMessageConverter jackson = new MappingJackson2HttpMessageConverter(mapper);
    List<HttpMessageConverter<?>> converters = new ArrayList<HttpMessageConverter<?>>();
    converters.add(jackson);

    RestTemplate restTemplate = new RestTemplate(factory);
    restTemplate.setMessageConverters(converters);
    return restTemplate;
  }
}

