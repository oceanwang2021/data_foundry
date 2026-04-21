package com.huatai.datafoundry.common.core.api;

import com.huatai.datafoundry.common.core.error.ErrorCode;

public class Response<T> {
  private Integer code;
  private String message;
  private T data;

  public static <T> Response<T> success(String message, T data) {
    Response<T> resp = new Response<T>();
    resp.code = ErrorCode.OK.getCode();
    resp.message = message != null ? message : ErrorCode.OK.getMessage();
    resp.data = data;
    return resp;
  }

  public static <T> Response<T> success(T data) {
    return success(ErrorCode.OK.getMessage(), data);
  }

  public static <T> Response<T> failure(ErrorCode errorCode) {
    Response<T> resp = new Response<T>();
    resp.code = errorCode != null ? errorCode.getCode() : ErrorCode.INTERNAL_ERROR.getCode();
    resp.message = errorCode != null ? errorCode.getMessage() : ErrorCode.INTERNAL_ERROR.getMessage();
    resp.data = null;
    return resp;
  }

  public static <T> Response<T> failure(Integer code, String message) {
    Response<T> resp = new Response<T>();
    resp.code = code != null ? code : ErrorCode.INTERNAL_ERROR.getCode();
    resp.message = message != null ? message : ErrorCode.INTERNAL_ERROR.getMessage();
    resp.data = null;
    return resp;
  }

  public Integer getCode() {
    return code;
  }

  public void setCode(Integer code) {
    this.code = code;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public T getData() {
    return data;
  }

  public void setData(T data) {
    this.data = data;
  }
}

