package com.huatai.datafoundry.backend.project.infrastructure.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class ProjectsSchemaAutoMigrator implements ApplicationRunner {
  private static final Logger log = LoggerFactory.getLogger(ProjectsSchemaAutoMigrator.class);

  private final DataSource dataSource;
  private final boolean enabled;

  public ProjectsSchemaAutoMigrator(
      DataSource dataSource,
      @Value("${datafoundry.db.auto-migrate:false}") boolean enabled) {
    this.dataSource = dataSource;
    this.enabled = enabled;
  }

  @Override
  public void run(ApplicationArguments args) {
    if (!enabled) {
      return;
    }

    try (Connection conn = dataSource.getConnection()) {
      if (!tableExists(conn, "projects")) {
        log.warn("[db-auto-migrate] projects table not found; skip.");
        return;
      }

      if (columnExists(conn, "projects", "created_by")) {
        log.info("[db-auto-migrate] projects.created_by exists; skip.");
        return;
      }

      log.warn("[db-auto-migrate] applying: add projects.created_by ...");
      try (PreparedStatement ps =
          conn.prepareStatement(
              "ALTER TABLE projects ADD COLUMN created_by VARCHAR(255) NOT NULL DEFAULT '' AFTER name")) {
        ps.execute();
      }
      log.warn("[db-auto-migrate] applied: projects.created_by added.");
    } catch (Exception ex) {
      log.error("[db-auto-migrate] failed: {}", ex.getMessage(), ex);
    }
  }

  private static boolean tableExists(Connection conn, String tableName) {
    try (PreparedStatement ps =
        conn.prepareStatement(
            "SELECT COUNT(1) FROM information_schema.tables "
                + "WHERE table_schema = DATABASE() AND table_name = ?")) {
      ps.setString(1, tableName);
      try (ResultSet rs = ps.executeQuery()) {
        return rs.next() && rs.getInt(1) > 0;
      }
    } catch (Exception ex) {
      return false;
    }
  }

  private static boolean columnExists(Connection conn, String tableName, String columnName) {
    try (PreparedStatement ps =
        conn.prepareStatement(
            "SELECT COUNT(1) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?")) {
      ps.setString(1, tableName);
      ps.setString(2, columnName);
      try (ResultSet rs = ps.executeQuery()) {
        return rs.next() && rs.getInt(1) > 0;
      }
    } catch (Exception ex) {
      return false;
    }
  }
}

