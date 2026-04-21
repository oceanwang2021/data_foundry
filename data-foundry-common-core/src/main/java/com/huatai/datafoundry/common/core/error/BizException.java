package com.huatai.datafoundry.common.core.error;

public class BizException extends RuntimeException {
  private final ErrorCode errorCode;

  public BizException(ErrorCode errorCode) {
    super(errorCode != null ? errorCode.getMessage() : null);
    this.errorCode = errorCode != null ? errorCode : ErrorCode.INTERNAL_ERROR;
  }

  public BizException(ErrorCode errorCode, String message) {
    super(message);
    this.errorCode = errorCode != null ? errorCode : ErrorCode.INTERNAL_ERROR;
  }

  public ErrorCode getErrorCode() {
    return errorCode;
  }
}

