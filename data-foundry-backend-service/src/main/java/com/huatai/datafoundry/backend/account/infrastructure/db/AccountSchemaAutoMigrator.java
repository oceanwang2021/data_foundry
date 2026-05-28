package com.huatai.datafoundry.backend.account.infrastructure.db;

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
public class AccountSchemaAutoMigrator implements ApplicationRunner {
  private static final Logger log = LoggerFactory.getLogger(AccountSchemaAutoMigrator.class);

  private final DataSource dataSource;
  private final boolean enabled;

  public AccountSchemaAutoMigrator(
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
      ensureAccountsTable(conn);
      ensureColumn(conn, "projects", "created_by_account", "ALTER TABLE projects ADD COLUMN created_by_account VARCHAR(255) NOT NULL DEFAULT '' AFTER created_by");
      ensureColumn(conn, "requirements", "created_by", "ALTER TABLE requirements ADD COLUMN created_by VARCHAR(255) NULL AFTER schema_locked");
      ensureColumn(conn, "requirements", "created_by_account", "ALTER TABLE requirements ADD COLUMN created_by_account VARCHAR(255) NULL AFTER created_by");
      ensureColumn(conn, "requirements", "owner_account", "ALTER TABLE requirements ADD COLUMN owner_account VARCHAR(255) NULL AFTER owner");
      ensureColumn(conn, "requirements", "assignee_account", "ALTER TABLE requirements ADD COLUMN assignee_account VARCHAR(255) NULL AFTER assignee");
      ensureColumn(conn, "requirements", "acceptance_owner", "ALTER TABLE requirements ADD COLUMN acceptance_owner VARCHAR(255) NULL AFTER assignee_account");
      ensureColumn(conn, "requirements", "acceptance_owner_account", "ALTER TABLE requirements ADD COLUMN acceptance_owner_account VARCHAR(255) NULL AFTER acceptance_owner");
      ensureColumn(conn, "acceptance_tickets", "owner_account", "ALTER TABLE acceptance_tickets ADD COLUMN owner_account VARCHAR(255) NULL AFTER owner");
      ensureColumn(conn, "acceptance_tickets", "reviewer_account", "ALTER TABLE acceptance_tickets ADD COLUMN reviewer_account VARCHAR(255) NULL AFTER reviewer");
    } catch (Exception ex) {
      log.error("[db-auto-migrate] account schema failed: {}", ex.getMessage(), ex);
    }
  }

  private void ensureAccountsTable(Connection conn) throws Exception {
    if (tableExists(conn, "accounts")) {
      return;
    }
    try (PreparedStatement ps =
        conn.prepareStatement(
            "CREATE TABLE accounts ("
                + "account VARCHAR(255) NOT NULL PRIMARY KEY,"
                + "password_hash VARCHAR(255) NOT NULL,"
                + "display_name VARCHAR(255) NOT NULL,"
                + "role VARCHAR(32) NOT NULL,"
                + "status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',"
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                + "INDEX idx_accounts_status (status),"
                + "INDEX idx_accounts_role (role),"
                + "INDEX idx_accounts_created_at (created_at)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")) {
      ps.execute();
      log.warn("[db-auto-migrate] created accounts table.");
    }
  }

  private void ensureColumn(Connection conn, String tableName, String columnName, String ddl) throws Exception {
    if (!tableExists(conn, tableName) || columnExists(conn, tableName, columnName)) {
      return;
    }
    try (PreparedStatement ps = conn.prepareStatement(ddl)) {
      ps.execute();
      log.warn("[db-auto-migrate] applied: {}.{} added.", tableName, columnName);
    }
  }

  private static boolean tableExists(Connection conn, String tableName) {
    try (PreparedStatement ps =
        conn.prepareStatement(
            "SELECT COUNT(1) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?")) {
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
            "SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?")) {
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
