package com.huatai.datafoundry.agent.integration.infrastructure.config;

import com.huatai.datafoundry.common.core.web.GlobalExceptionHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@Configuration
@Import(GlobalExceptionHandler.class)
public class CommonCoreWebConfig {}
