package com.huatai.datafoundry.scheduler.schedule.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "xxl.job")
public class XxlJobProperties {
  private final Admin admin = new Admin();
  private final Executor executor = new Executor();
  private final Sync sync = new Sync();
  private String accessToken = "";
  private int timeout = 3;

  public Admin getAdmin() {
    return admin;
  }

  public Executor getExecutor() {
    return executor;
  }

  public Sync getSync() {
    return sync;
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
    private String username = "";
    private String password = "";

    public String getAddresses() {
      return addresses;
    }

    public void setAddresses(String addresses) {
      this.addresses = addresses;
    }

    public String getUsername() {
      return username;
    }

    public void setUsername(String username) {
      this.username = username;
    }

    public String getPassword() {
      return password;
    }

    public void setPassword(String password) {
      this.password = password;
    }
  }

  public static class Sync {
    private boolean enabled;
    private int batchSize = 50;
    private long fixedDelayMs = 30000L;
    private long initialDelayMs = 10000L;
    private String groupTitle = "Data Foundry Scheduler";
    private String author = "data-foundry";

    public boolean isEnabled() {
      return enabled;
    }

    public void setEnabled(boolean enabled) {
      this.enabled = enabled;
    }

    public int getBatchSize() {
      return batchSize;
    }

    public void setBatchSize(int batchSize) {
      this.batchSize = batchSize;
    }

    public long getFixedDelayMs() {
      return fixedDelayMs;
    }

    public void setFixedDelayMs(long fixedDelayMs) {
      this.fixedDelayMs = fixedDelayMs;
    }

    public long getInitialDelayMs() {
      return initialDelayMs;
    }

    public void setInitialDelayMs(long initialDelayMs) {
      this.initialDelayMs = initialDelayMs;
    }

    public String getGroupTitle() {
      return groupTitle;
    }

    public void setGroupTitle(String groupTitle) {
      this.groupTitle = groupTitle;
    }

    public String getAuthor() {
      return author;
    }

    public void setAuthor(String author) {
      this.author = author;
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
