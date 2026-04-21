package com.huatai.datafoundry.backend.task.domain.model;

public final class TaskStatus {
  private TaskStatus() {}

  public static final String PENDING = "pending";
  public static final String RUNNING = "running";
  public static final String COMPLETED = "completed";
  public static final String FAILED = "failed";
  public static final String INVALIDATED = "invalidated";

  public static int rank(String status) {
    if (status == null) return 0;
    String s = status.trim().toLowerCase();
    if (PENDING.equals(s)) return 1;
    if (RUNNING.equals(s)) return 2;
    if (FAILED.equals(s)) return 3;
    if (COMPLETED.equals(s)) return 4;
    if (INVALIDATED.equals(s)) return 5;
    return 1;
  }

  public static boolean isTerminal(String status) {
    return COMPLETED.equalsIgnoreCase(status) || INVALIDATED.equalsIgnoreCase(status);
  }

  public static boolean isInvalidated(String status) {
    return INVALIDATED.equalsIgnoreCase(status);
  }

  public static String preferMoreAdvanced(String existing, String incoming) {
    if (rank(existing) >= rank(incoming)) {
      return existing;
    }
    return incoming;
  }
}
