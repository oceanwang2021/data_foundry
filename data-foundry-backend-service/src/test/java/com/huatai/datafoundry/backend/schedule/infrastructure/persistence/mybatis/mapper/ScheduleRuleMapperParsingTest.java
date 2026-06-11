package com.huatai.datafoundry.backend.schedule.infrastructure.persistence.mybatis.mapper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

class ScheduleRuleMapperParsingTest {

  @Test
  void parsesAllAnnotatedStatements() {
    Configuration configuration = new Configuration();

    assertDoesNotThrow(() -> configuration.addMapper(ScheduleRuleMapper.class));
    assertTrue(configuration.hasStatement(ScheduleRuleMapper.class.getName() + ".upsertBatch"));
  }
}
