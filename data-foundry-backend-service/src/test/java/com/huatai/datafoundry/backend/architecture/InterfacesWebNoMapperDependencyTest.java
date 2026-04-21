package com.huatai.datafoundry.backend.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.apache.ibatis.annotations.Mapper;
import org.junit.jupiter.api.Test;

/**
 * M6c gate: controllers must not depend on MyBatis mappers.
 *
 * <p>Notes:
 * - This is a minimal hard gate that is compatible with current refactor phase.
 * - Record/DTO dependencies are not gated yet.
 */
public class InterfacesWebNoMapperDependencyTest {

  @Test
  void interfacesWebMustNotDependOnMapper() {
    JavaClasses classes = new ClassFileImporter().importPackages("com.huatai.datafoundry.backend");
    ArchRule rule =
        noClasses()
            .that()
            .resideInAPackage("..interfaces.web..")
            .should()
            .dependOnClassesThat()
            .areAnnotatedWith(Mapper.class);
    rule.check(classes);
  }
}
