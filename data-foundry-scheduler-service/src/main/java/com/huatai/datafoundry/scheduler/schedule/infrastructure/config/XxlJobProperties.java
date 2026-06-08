package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "xxl.job")
public class XxlJobProperties {
  private final Admin admin = new Admin();
  private final Executor executor = new Executor();
  private String accessToken = "";
  private int timeout = 3;

  public Admin getAdmin() {
    return admin;
  }

  public Executor getExecutor() {
    return executor;
  }

  public String getAccessToken() {
    return accessToken;
  }

  public void setAccessToken(String accessToken) {
    this.accessToken = accessToken;
  }

  public int getTimeout() {
    return timeout;
  }

  public void setTimeout(int timeout) {
    this.timeout = timeout;
  }

  public static class Admin {
    private String addresses = "";

    public String getAddresses() {
      return addresses;
    }

    public void setAddresses(String addresses) {
      this.addresses = addresses;
    }
  }

  public static class Executor {
    private boolean enabled;
    private String appname = "data-foundry-scheduler-local";
    private String address = "";
    private String ip = "";
    private int port = 9999;
    private String logpath = "./logs/xxl-job/jobhandler";
    private int logretentiondays = 30;

    public boolean isEnabled() {
      return enabled;
    }

    public void setEnabled(boolean enabled) {
      this.enabled = enabled;
    }

    public String getAppname() {
      return appname;
    }

    public void setAppname(String appname) {
      this.appname = appname;
    }

    public String getAddress() {
      return address;
    }

    public void setAddress(String address) {
      this.address = address;
    }

    public String getIp() {
      return ip;
    }

    public void setIp(String ip) {
      this.ip = ip;
    }

    public int getPort() {
      return port;
    }

    public void setPort(int port) {
      this.port = port;
    }

    public String getLogpath() {
      return logpath;
    }

    public void setLogpath(String logpath) {
      this.logpath = logpath;
    }

    public int getLogretentiondays() {
      return logretentiondays;
    }

    public void setLogretentiondays(int logretentiondays) {
      this.logretentiondays = logretentiondays;
    }
  }
}
