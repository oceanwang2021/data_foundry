package com.huatai.datafoundry.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(
    scanBasePackages = {
      "com.huatai.datafoundry.backend.integration",
      "com.huatai.datafoundry.backend.health",
      "com.huatai.datafoundry.backend.ops",
      "com.huatai.datafoundry.backend.project",
      "com.huatai.datafoundry.backend.requirement",
      "com.huatai.datafoundry.backend.task",
      "com.huatai.datafoundry.common.core"
    })
public class DataFoundryBackendApplication {
  public static void main(String[] args) {
    SpringApplication.run(DataFoundryBackendApplication.class, args);
  }
}
