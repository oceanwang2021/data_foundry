package com.huatai.datafoundry.common.core.error;

public class IntegrationException extends RuntimeException {
  private final ErrorCode errorCode;

  public IntegrationException(ErrorCode errorCode) {
    super(errorCode != null ? errorCode.getMessage() : null);
    this.errorCode = errorCode != null ? errorCode : ErrorCode.DOWNSTREAM_ERROR;
  }

  public IntegrationException(ErrorCode errorCode, String message) {
    super(message);
    this.errorCode = errorCode != null ? errorCode : ErrorCode.DOWNSTREAM_ERROR;
  }

  public ErrorCode getErrorCode() {
    return errorCode;
  }
}

