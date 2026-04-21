package com.huatai.datafoundry.backend.task.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datafoundry.task.execution")
public class TaskExecutionProperties {
  /**
   * Placeholder behavior during refactor: mark task/taskGroup completed immediately after starting.
   *
   * <p>Set to false when backend execution result is driven by scheduler/agent callback or polling.</p>
   */
  private boolean placeholderComplete = true;

  public boolean isPlaceholderComplete() {
    return placeholderComplete;
  }

  public void setPlaceholderComplete(boolean placeholderComplete) {
    this.placeholderComplete = placeholderComplete;
  }
}

