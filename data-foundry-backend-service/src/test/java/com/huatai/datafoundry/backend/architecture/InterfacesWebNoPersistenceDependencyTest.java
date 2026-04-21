package com.huatai.datafoundry.backend.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/** Gate: controllers in interfaces.web must not depend on MyBatis persistence (mapper/record). */
public class InterfacesWebNoPersistenceDependencyTest {

  @Test
  void interfacesWebMustNotDependOnInfrastructurePersistence() {
    JavaClasses classes = new ClassFileImporter().importPackages("com.huatai.datafoundry.backend");
    ArchRule rule =
        noClasses()
            .that()
            .resideInAPackage("..interfaces.web..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..infrastructure.persistence.mybatis..");
    rule.check(classes);
  }
}

