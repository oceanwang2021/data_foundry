package com.huatai.datafoundry.backend.account.interfaces.web;

import com.huatai.datafoundry.backend.account.application.command.AccountUpdateCommand;
import com.huatai.datafoundry.backend.account.application.query.dto.AccountReadDto;
import com.huatai.datafoundry.backend.account.application.service.AccountAppService;
import java.util.List;
import javax.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {
  private final AccountAppService accountAppService;
  private final AccountAuthSupport accountAuthSupport;

  public AccountController(AccountAppService accountAppService, AccountAuthSupport accountAuthSupport) {
    this.accountAppService = accountAppService;
    this.accountAuthSupport = accountAuthSupport;
  }

  @GetMapping
  public List<AccountReadDto> list(HttpServletRequest request) {
    accountAuthSupport.requireAdmin(request);
    return accountAppService.listAccounts();
  }

  @PutMapping("/{account}")
  public AccountReadDto update(
      @PathVariable("account") String account,
      @RequestBody AccountUpdateCommand request,
      HttpServletRequest servletRequest) {
    accountAuthSupport.requireAdmin(servletRequest);
    return accountAppService.updateAccount(account, request);
  }

  @GetMapping("/options")
  public List<AccountReadDto> listOptions(HttpServletRequest request) {
    accountAuthSupport.requireCurrentUser(request);
    return accountAppService.listActiveAccounts();
  }
}
