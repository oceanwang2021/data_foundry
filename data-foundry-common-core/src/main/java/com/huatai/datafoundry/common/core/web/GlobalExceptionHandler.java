package com.huatai.datafoundry.common.core.web;

import com.huatai.datafoundry.common.core.api.Response;
import com.huatai.datafoundry.common.core.error.BizException;
import com.huatai.datafoundry.common.core.error.ErrorCode;
import com.huatai.datafoundry.common.core.error.IntegrationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(BizException.class)
  public ResponseEntity<Response<Object>> handleBizException(BizException ex) {
    ErrorCode errorCode = ex.getErrorCode() != null ? ex.getErrorCode() : ErrorCode.INTERNAL_ERROR;
    return ResponseEntity.status(toHttpStatus(errorCode.getHttpStatus()))
        .body(Response.failure(errorCode.getCode(), messageOrDefault(ex.getMessage(), errorCode.getMessage())));
  }

  @ExceptionHandler(IntegrationException.class)
  public ResponseEntity<Response<Object>> handleIntegrationException(IntegrationException ex) {
    ErrorCode errorCode = ex.getErrorCode() != null ? ex.getErrorCode() : ErrorCode.DOWNSTREAM_ERROR;
    return ResponseEntity.status(toHttpStatus(errorCode.getHttpStatus()))
        .body(Response.failure(errorCode.getCode(), messageOrDefault(ex.getMessage(), errorCode.getMessage())));
  }

  private static HttpStatus toHttpStatus(int status) {
    try {
      return HttpStatus.valueOf(status);
    } catch (Exception ignored) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  private static String messageOrDefault(String message, String fallback) {
    if (message == null || message.trim().isEmpty()) return fallback;
    return message;
  }
}

