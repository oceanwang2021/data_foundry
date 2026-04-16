-- Backend DB schema (business master data + wide-table results)
-- Database/user creation is environment-specific; create them outside or adapt this script.

CREATE TABLE IF NOT EXISTS projects (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  business_background TEXT   NULL,
  description   TEXT         NULL,
  status        VARCHAR(32)  NOT NULL DEFAULT 'active',
  owner_team    VARCHAR(255) NOT NULL DEFAULT '',
  data_source   JSON         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requirements (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  project_id    VARCHAR(64)  NOT NULL,
  title         VARCHAR(255) NOT NULL,
  phase         VARCHAR(32)  NOT NULL DEFAULT 'demo',
  status        VARCHAR(32)  NOT NULL DEFAULT 'draft',
  schema_locked TINYINT(1)   NULL,
  owner         VARCHAR(255) NULL,
  assignee      VARCHAR(255) NULL,
  business_goal TEXT         NULL,
  background_knowledge TEXT  NULL,
  business_boundary TEXT     NULL,
  delivery_scope TEXT        NULL,
  collection_policy JSON     NULL,
  data_update_enabled TINYINT(1) NULL,
  data_update_mode VARCHAR(32)   NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_requirements_project_id (project_id)
);
