package com.huatai.datafoundry.backend.account.application.query.dto;

public class AuthLoginResultDto {
  private String token;
  private AccountReadDto user;

  public String getToken() {
    return token;
  }

  public void setToken(String token) {
    this.token = token;
  }

  public AccountReadDto getUser() {
    return user;
  }

  public void setUser(AccountReadDto user) {
    this.user = user;
  }
}
