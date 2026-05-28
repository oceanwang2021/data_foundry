package com.huatai.datafoundry.backend.account.interfaces.web;

import com.huatai.datafoundry.backend.account.application.service.AccountAppService;
import com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.record.AccountRecord;
import javax.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AccountAuthSupport {
  private final AccountAppService accountAppService;

  public AccountAuthSupport(AccountAppService accountAppService) {
    this.accountAppService = accountAppService;
  }

  public AccountRecord requireCurrentUser(HttpServletRequest request) {
    String authorization = request != null ? request.getHeader("Authorization") : null;
    return accountAppService.requireActiveAccountByToken(authorization);
  }

  public AccountRecord requireAdmin(HttpServletRequest request) {
    AccountRecord current = requireCurrentUser(request);
    if (!"ADMIN".equals(current.getRole())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access required");
    }
    return current;
  }
}
