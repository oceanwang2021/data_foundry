package com.huatai.datafoundry.common.core.error;

public enum ErrorCode {
  OK(0, "ok", 200),

  BAD_REQUEST(40000, "bad request", 400),
  VALIDATION_ERROR(40001, "validation error", 400),
  NOT_FOUND(40400, "not found", 404),
  CONFLICT(40900, "conflict", 409),

  DOWNSTREAM_ERROR(50200, "downstream error", 502),
  INTERNAL_ERROR(50000, "internal error", 500);

  private final int code;
  private final String message;
  private final int httpStatus;

  ErrorCode(int code, String message, int httpStatus) {
    this.code = code;
    this.message = message;
    this.httpStatus = httpStatus;
  }

  public int getCode() {
    return code;
  }

  public String getMessage() {
    return message;
  }

  public int getHttpStatus() {
    return httpStatus;
  }
}

