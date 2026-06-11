package com.huatai.datafoundry.scheduler.schedule.domain.gateway;

import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncCommand;
import com.huatai.datafoundry.contract.scheduler.XxlJobRuleSyncResult;

public interface XxlJobAdminGateway {
  XxlJobRuleSyncResult synchronize(XxlJobRuleSyncCommand command);
}
