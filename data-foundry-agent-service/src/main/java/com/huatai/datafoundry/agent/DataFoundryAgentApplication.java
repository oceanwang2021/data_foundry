package com.huatai.datafoundry.agent;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(
    scanBasePackages = {
      "com.huatai.datafoundry.agent.integration",
      "com.huatai.datafoundry.agent.health",
      "com.huatai.datafoundry.agent.agent",
      "com.huatai.datafoundry.common.core"
    })
public class DataFoundryAgentApplication {
  public static void main(String[] args) {
    SpringApplication.run(DataFoundryAgentApplication.class, args);
  }
}
