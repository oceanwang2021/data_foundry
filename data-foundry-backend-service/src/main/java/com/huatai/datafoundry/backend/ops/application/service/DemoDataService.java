package com.huatai.datafoundry.backend.ops.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.springframework.stereotype.Service;

@Service
public class DemoDataService {
  private final DataSource dataSource;
  private final ObjectMapper objectMapper;

  public DemoDataService(DataSource dataSource, ObjectMapper objectMapper) {
    this.dataSource = dataSource;
    this.objectMapper = objectMapper;
  }

  public DemoMetrics metrics() {
    DemoMetrics out = new DemoMetrics();
    try (Connection conn = dataSource.getConnection()) {
      out.projects = queryCount(conn, "select count(*) from projects");
      out.requirements = queryCount(conn, "select count(*) from requirements");
    } catch (SQLException ex) {
      // If schema isn't ready yet, keep zeros.
    }
    return out;
  }

  public void reset() throws SQLException {
    try (Connection conn = dataSource.getConnection(); Statement st = conn.createStatement()) {
      // Delete child first to avoid future FK constraints.
      st.execute("delete from requirements");
      st.execute("delete from projects");
    }
  }

  public SeedResult seed() throws SQLException {
    ensureSchemaColumns();
    upsertDemoProjectsAndRequirements();
    DemoMetrics metrics = metrics();
    SeedResult out = new SeedResult();
    out.ok = true;
    out.projects = metrics.projects;
    out.requirements = metrics.requirements;
    out.message = "seed ok";
    return out;
  }

  private void ensureSchemaColumns() throws SQLException {
    try (Connection conn = dataSource.getConnection(); Statement st = conn.createStatement()) {
      // Best-effort, ignore duplicate-column errors.
      safeExecute(st, "alter table projects add column business_background text null");
      safeExecute(st, "alter table projects add column status varchar(32) not null default 'active'");
      safeExecute(st, "alter table projects add column owner_team varchar(255) not null default ''");
      safeExecute(st, "alter table projects add column data_source json null");
      safeExecute(st, "alter table projects add column updated_at datetime not null default current_timestamp on update current_timestamp");

      safeExecute(st, "alter table requirements add column schema_locked tinyint(1) null");
      safeExecute(st, "alter table requirements add column owner varchar(255) null");
      safeExecute(st, "alter table requirements add column assignee varchar(255) null");
      safeExecute(st, "alter table requirements add column business_goal text null");
      safeExecute(st, "alter table requirements add column background_knowledge text null");
      safeExecute(st, "alter table requirements add column business_boundary text null");
      safeExecute(st, "alter table requirements add column delivery_scope text null");
      safeExecute(st, "alter table requirements add column collection_policy json null");
      safeExecute(st, "alter table requirements add column data_update_enabled tinyint(1) null");
      safeExecute(st, "alter table requirements add column data_update_mode varchar(32) null");
    }
  }

  private void safeExecute(Statement st, String sql) throws SQLException {
    try {
      st.execute(sql);
    } catch (SQLException ex) {
      // MySQL duplicate column name: 1060, ignore. Any other error bubble up.
      if (ex.getErrorCode() == 1060) {
        return;
      }
      throw ex;
    }
  }

  private long queryCount(Connection conn, String sql) throws SQLException {
    try (java.sql.ResultSet rs = conn.createStatement().executeQuery(sql)) {
      return rs.next() ? rs.getLong(1) : 0L;
    }
  }

  private void upsertDemoProjectsAndRequirements() throws SQLException {
    // Seed values are aligned with `data-foundry-frontend/lib/mock-data.ts`.
    String proj1DataSource = toJson(new Object() {
      public Object search = new Object() {
        public String[] engines = new String[] {"bing", "volcano"};
        public String[] sites = new String[] {"site:waymo.com", "site:ponyai.com", "site:dmv.ca.gov"};
        public String sitePolicy = "preferred";
      };
      public String[] knowledgeBases = new String[] {"kb_autodrive_industry"};
      public String[] fixedUrls = new String[] {"https://waymo.com/safety/", "https://pony.ai/"};
    });

    String proj2DataSource = toJson(new Object() {
      public Object search = new Object() {
        public String[] engines = new String[] {"volcano"};
        public String[] sites = new String[] {"site:clinicaltrials.gov", "site:fda.gov", "site:asco.org"};
        public String sitePolicy = "whitelist";
      };
      public String[] knowledgeBases = new String[] {"kb_pharma_reports"};
      public String[] fixedUrls = new String[] {"https://clinicaltrials.gov/", "https://www.fda.gov/"};
    });

    try (Connection conn = dataSource.getConnection()) {
      conn.setAutoCommit(false);
      try {
        upsertProject(conn,
            "PROJ-001",
            "自动驾驶",
            "聚焦自动驾驶运营效率与安全指标，面向月度更新与专题分析。",
            "围绕行业专题承接需求定义、宽表生成和任务执行。",
            "active",
            "AI投研业务数据团队",
            proj1DataSource);

        upsertProject(conn,
            "PROJ-002",
            "创新药",
            "聚焦肿瘤药物临床疗效、安全性与监管披露的结构化生产。",
            "围绕临床疗效与安全性构建结构化生产链路。",
            "active",
            "AI投研业务数据团队",
            proj2DataSource);

        upsertRequirement(conn,
            "REQ-2026-001",
            "PROJ-001",
            "自动驾驶运营快照采集",
            "production",
            "ready",
            null,
            "业务-张宁",
            "算法-陈飞",
            "先把自动驾驶运营快照宽表稳定下来，再按全量快照生成记录、任务组与采集任务。",
            null,
            "当前需求按运营商维度采集全量快照，不按业务日期做增量拆分",
            "滴滴全球 / 如祺出行 / 曹操出行 / 小马智行",
            null,
            null,
            null);

        upsertRequirement(conn,
            "REQ-2026-004",
            "PROJ-001",
            "自动驾驶安全月度采集",
            "production",
            "ready",
            null,
            "业务-张宁",
            "算法-陈飞",
            "先把自动驾驶安全宽表稳定下来，再按宽表生成记录、任务组与采集任务。",
            null,
            "MPI 接管里程与事故率都必须保持百万公里归一口径",
            "Waymo / Pony.ai，旧金山，2025-01",
            null,
            null,
            null);

        upsertRequirement(conn,
            "REQ-2026-002",
            "PROJ-002",
            "ADC 三期疗效采集",
            "production",
            "ready",
            null,
            "业务-李参",
            "算法-许越",
            "先把临床疗效与安全性的宽表 Schema、指标组和业务日期范围稳定下来。",
            null,
            "需要按药物和适应症固定主维度，避免跨队列比较",
            "DS-8201，HER2阳性乳腺癌，2024",
            null,
            null,
            null);

        upsertRequirement(conn,
            "REQ-2026-003",
            "PROJ-002",
            "ADC 三期疗效采集",
            "production",
            "running",
            null,
            "业务-李参",
            "算法-许越",
            "沿用已稳定的临床宽表定义，在不改 Schema 的前提下扩展药物与业务日期范围并持续生产。",
            null,
            "需要按药物和适应症固定主维度，避免跨队列比较",
            "DS-8201，HER2阳性乳腺癌，2025",
            null,
            null,
            null);

        conn.commit();
      } catch (SQLException ex) {
        conn.rollback();
        throw ex;
      } finally {
        conn.setAutoCommit(true);
      }
    }
  }

  private void upsertProject(
      Connection conn,
      String id,
      String name,
      String businessBackground,
      String description,
      String status,
      String ownerTeam,
      String dataSourceJson) throws SQLException {
    String sql = "insert into projects (id, name, business_background, description, status, owner_team, data_source) "
        + "values (?, ?, ?, ?, ?, ?, cast(? as json)) "
        + "on duplicate key update "
        + "name=values(name), business_background=values(business_background), description=values(description), "
        + "status=values(status), owner_team=values(owner_team), data_source=values(data_source)";
    try (PreparedStatement ps = conn.prepareStatement(sql)) {
      ps.setString(1, id);
      ps.setString(2, name);
      ps.setString(3, businessBackground);
      ps.setString(4, description);
      ps.setString(5, status);
      ps.setString(6, ownerTeam);
      ps.setString(7, dataSourceJson);
      ps.executeUpdate();
    }
  }

  private void upsertRequirement(
      Connection conn,
      String id,
      String projectId,
      String title,
      String phase,
      String status,
      Boolean schemaLocked,
      String owner,
      String assignee,
      String businessGoal,
      String backgroundKnowledge,
      String businessBoundary,
      String deliveryScope,
      String collectionPolicyJson,
      Boolean dataUpdateEnabled,
      String dataUpdateMode) throws SQLException {
    String sql = "insert into requirements (id, project_id, title, phase, status, schema_locked, owner, assignee, "
        + "business_goal, background_knowledge, business_boundary, delivery_scope, collection_policy, "
        + "data_update_enabled, data_update_mode) "
        + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?) "
        + "on duplicate key update "
        + "title=values(title), phase=values(phase), status=values(status), schema_locked=values(schema_locked), "
        + "owner=values(owner), assignee=values(assignee), business_goal=values(business_goal), "
        + "background_knowledge=values(background_knowledge), business_boundary=values(business_boundary), "
        + "delivery_scope=values(delivery_scope), collection_policy=values(collection_policy), "
        + "data_update_enabled=values(data_update_enabled), data_update_mode=values(data_update_mode)";
    try (PreparedStatement ps = conn.prepareStatement(sql)) {
      ps.setString(1, id);
      ps.setString(2, projectId);
      ps.setString(3, title);
      ps.setString(4, phase);
      ps.setString(5, status);
      if (schemaLocked == null) {
        ps.setObject(6, null);
      } else {
        ps.setInt(6, schemaLocked.booleanValue() ? 1 : 0);
      }
      ps.setString(7, owner);
      ps.setString(8, assignee);
      ps.setString(9, businessGoal);
      ps.setString(10, backgroundKnowledge);
      ps.setString(11, businessBoundary);
      ps.setString(12, deliveryScope);
      ps.setString(13, collectionPolicyJson != null ? collectionPolicyJson : "{}");
      if (dataUpdateEnabled == null) {
        ps.setObject(14, null);
      } else {
        ps.setInt(14, dataUpdateEnabled.booleanValue() ? 1 : 0);
      }
      ps.setString(15, dataUpdateMode);
      ps.executeUpdate();
    }
  }

  private String toJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      return "{}";
    }
  }

  public static class DemoMetrics {
    public long projects;
    public long requirements;
  }

  public static class SeedResult {
    public boolean ok;
    public String message;
    public long projects;
    public long requirements;
  }
}
