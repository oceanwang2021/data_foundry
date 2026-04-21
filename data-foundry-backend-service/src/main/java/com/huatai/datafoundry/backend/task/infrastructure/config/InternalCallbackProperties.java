package com.huatai.datafoundry.backend.task.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datafoundry.internal.callback")
public class InternalCallbackProperties {
  /**
   * When enabled, backend will require {@code X-Internal-Token} for
   * {@code /internal/scheduler/executions/callback}.
   */
  private boolean requireToken = false;

  /** Shared secret between scheduler-service and backend-service. */
  private String token;

  public boolean isRequireToken() {
    return requireToken;
  }

  public void setRequireToken(boolean requireToken) {
    this.requireToken = requireToken;
  }

  public String getToken() {
    return token;
  }

  public void setToken(String token) {
    this.token = token;
  }
}

