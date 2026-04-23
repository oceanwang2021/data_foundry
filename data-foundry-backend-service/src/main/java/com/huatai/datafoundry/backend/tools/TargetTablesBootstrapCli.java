package com.huatai.datafoundry.backend.tools;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

public class TargetTablesBootstrapCli {
  private static final String DEFAULT_URL =
      "jdbc:mysql://127.0.0.1:3306/data_foundry_backend?useSSL=false&characterEncoding=utf8&serverTimezone=Asia/Shanghai";
  private static final String DEFAULT_USERNAME = "data_foundry_backend";
  private static final String DEFAULT_PASSWORD = "data_foundry_backend";

  public static void main(String[] args) throws Exception {
    String url = firstNonBlank(sysProp("spring.datasource.url"), env("SPRING_DATASOURCE_URL"), DEFAULT_URL);
    String username =
        firstNonBlank(sysProp("spring.datasource.username"), env("SPRING_DATASOURCE_USERNAME"), DEFAULT_USERNAME);
    String password =
        firstNonBlank(sysProp("spring.datasource.password"), env("SPRING_DATASOURCE_PASSWORD"), DEFAULT_PASSWORD);

    Class.forName("com.mysql.cj.jdbc.Driver");

    try (Connection conn = DriverManager.getConnection(url, username, password)) {
      conn.setAutoCommit(true);

      String createSchemaSql =
          "CREATE DATABASE IF NOT EXISTS target_tables "
              + "DEFAULT CHARACTER SET utf8mb4 "
              + "DEFAULT COLLATE utf8mb4_unicode_ci";

      String createTableSql =
          "CREATE TABLE IF NOT EXISTS target_tables.ads_autodrive_safety ("
              + "  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '行ID',"
              + "  company VARCHAR(255) NOT NULL COMMENT '公司',"
              + "  city VARCHAR(255) NOT NULL COMMENT '城市',"
              + "  biz_date DATE NOT NULL COMMENT '业务日期（月末日期）',"
              + "  mpi_takeover_miles DECIMAL(18,2) NULL COMMENT 'MPI接管里程',"
              + "  incident_rate DECIMAL(10,4) NULL COMMENT '事故率（百万公里归一）',"
              + "  row_status VARCHAR(32) NOT NULL DEFAULT 'initialized' COMMENT '行状态',"
              + "  last_task_id VARCHAR(255) NULL COMMENT '最近任务ID',"
              + "  updated_at DATETIME NULL COMMENT '更新时间',"
              + "  PRIMARY KEY (id),"
              + "  UNIQUE KEY uk_ads_autodrive_safety_scope (company, city, biz_date),"
              + "  KEY idx_ads_autodrive_safety_biz_date (biz_date)"
              + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 "
              + "COMMENT='按公司、城市和业务月份组织的安全指标宽表。'";

      try (Statement st = conn.createStatement()) {
        System.out.println("[bootstrap] executing: CREATE DATABASE target_tables ...");
        st.execute(createSchemaSql);
        System.out.println("[bootstrap] executing: CREATE TABLE target_tables.ads_autodrive_safety ...");
        st.execute(createTableSql);
      }

      boolean schemaExists = exists(conn,
          "SELECT COUNT(1) FROM information_schema.schemata WHERE schema_name = ?",
          "target_tables");
      boolean tableExists = exists(conn,
          "SELECT COUNT(1) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
          "target_tables", "ads_autodrive_safety");

      System.out.println("[bootstrap] schema target_tables exists: " + schemaExists);
      System.out.println("[bootstrap] table target_tables.ads_autodrive_safety exists: " + tableExists);
    }
  }

  private static boolean exists(Connection conn, String sql, String... params) throws Exception {
    try (PreparedStatement ps = conn.prepareStatement(sql)) {
      for (int i = 0; i < params.length; i++) {
        ps.setString(i + 1, params[i]);
      }
      try (ResultSet rs = ps.executeQuery()) {
        return rs.next() && rs.getInt(1) > 0;
      }
    }
  }

  private static String sysProp(String key) {
    return System.getProperty(key);
  }

  private static String env(String key) {
    return System.getenv(key);
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) {
        return value.trim();
      }
    }
    return null;
  }
}

