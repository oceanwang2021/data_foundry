package com.huatai.datafoundry.backend.account.interfaces.web;

import com.huatai.datafoundry.backend.account.application.command.AccountLoginCommand;
import com.huatai.datafoundry.backend.account.application.command.AccountRegisterCommand;
import com.huatai.datafoundry.backend.account.application.query.dto.AccountReadDto;
import com.huatai.datafoundry.backend.account.application.query.dto.AuthLoginResultDto;
import com.huatai.datafoundry.backend.account.application.service.AccountAppService;
import javax.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AccountAppService accountAppService;

  public AuthController(AccountAppService accountAppService) {
    this.accountAppService = accountAppService;
  }

  @PostMapping("/register")
  public AccountReadDto register(@RequestBody AccountRegisterCommand request) {
    return accountAppService.register(request);
  }

  @PostMapping("/login")
  public AuthLoginResultDto login(@RequestBody AccountLoginCommand request) {
    return accountAppService.login(request);
  }

  @GetMapping("/me")
  public AccountReadDto me(HttpServletRequest request) {
    return accountAppService.getCurrentUser(request.getHeader("Authorization"));
  }
}
