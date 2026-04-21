package com.huatai.datafoundry.scheduler.integration.infrastructure.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan(basePackages = {"com.huatai.datafoundry.scheduler.schedule.infrastructure.persistence.mybatis.mapper"})
public class MybatisMapperScanConfig {}
