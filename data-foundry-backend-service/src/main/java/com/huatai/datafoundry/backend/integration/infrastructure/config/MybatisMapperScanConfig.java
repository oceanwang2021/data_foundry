package com.huatai.datafoundry.backend.integration.infrastructure.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan(
    basePackages = {
      "com.huatai.datafoundry.backend.project.infrastructure.persistence.mybatis.mapper",
      "com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper",
      "com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper"
    })
public class MybatisMapperScanConfig {}
