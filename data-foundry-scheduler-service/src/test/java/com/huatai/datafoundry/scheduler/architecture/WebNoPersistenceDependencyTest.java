package com.huatai.datafoundry.scheduler.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/** Gate: scheduler web controllers must not depend on MyBatis persistence (mapper/record). */
public class WebNoPersistenceDependencyTest {

  @Test
  void webMustNotDependOnInfrastructurePersistence() {
    JavaClasses classes = new ClassFileImporter().importPackages("com.huatai.datafoundry.scheduler");
    ArchRule rule =
        noClasses()
            .that()
            .resideInAPackage("..web..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..infrastructure.persistence.mybatis..");
    rule.check(classes);
  }
}

