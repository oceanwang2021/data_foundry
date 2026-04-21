package com.huatai.datafoundry.scheduler.schedule.application.event;

public class ScheduleJobCreatedEvent {
  private final String jobId;

  public ScheduleJobCreatedEvent(String jobId) {
    this.jobId = jobId;
  }

  public String getJobId() {
    return jobId;
  }
}

