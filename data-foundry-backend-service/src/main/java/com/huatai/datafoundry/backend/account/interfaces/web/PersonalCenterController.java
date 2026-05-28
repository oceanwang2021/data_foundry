package com.huatai.datafoundry.backend.account.interfaces.web;

import com.huatai.datafoundry.backend.account.application.query.dto.PersonalCenterOverviewDto;
import com.huatai.datafoundry.backend.account.application.query.service.PersonalCenterQueryService;
import com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.record.AccountRecord;
import javax.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/personal-center")
public class PersonalCenterController {
  private final PersonalCenterQueryService personalCenterQueryService;
  private final AccountAuthSupport accountAuthSupport;

  public PersonalCenterController(
      PersonalCenterQueryService personalCenterQueryService,
      AccountAuthSupport accountAuthSupport) {
    this.personalCenterQueryService = personalCenterQueryService;
    this.accountAuthSupport = accountAuthSupport;
  }

  @GetMapping
  public PersonalCenterOverviewDto overview(HttpServletRequest request) {
    AccountRecord currentUser = accountAuthSupport.requireCurrentUser(request);
    return personalCenterQueryService.getOverview(currentUser.getAccount());
  }
}
