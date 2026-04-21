package com.huatai.datafoundry.scheduler;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(
    scanBasePackages = {
      "com.huatai.datafoundry.scheduler.integration",
      "com.huatai.datafoundry.scheduler.health",
      "com.huatai.datafoundry.scheduler.ops",
      "com.huatai.datafoundry.scheduler.schedule",
      "com.huatai.datafoundry.common.core"
    })
public class DataFoundrySchedulerApplication {
  public static void main(String[] args) {
    SpringApplication.run(DataFoundrySchedulerApplication.class, args);
  }
}
