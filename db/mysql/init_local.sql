-- Local MySQL bootstrap for Data Foundry (backend DB + scheduler DB)
--
-- Usage (recommended):
--   mysql -h 127.0.0.1 -P 3306 --protocol=TCP -u root -p < db/mysql/init_local.sql
--
-- This script:
-- 1) Creates two isolated databases
-- 2) Creates/updates two service users
-- 3) Grants least-necessary privileges per database
-- 4) Loads initial DDL from db/mysql/*/001_schema.sql

CREATE DATABASE IF NOT EXISTS data_foundry_backend
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE DATABASE IF NOT EXISTS data_foundry_scheduler
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE DATABASE IF NOT EXISTS target_tables
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'data_foundry_backend'@'localhost' IDENTIFIED BY 'data_foundry_backend';
CREATE USER IF NOT EXISTS 'data_foundry_backend'@'%' IDENTIFIED BY 'data_foundry_backend';
ALTER USER 'data_foundry_backend'@'localhost' IDENTIFIED BY 'data_foundry_backend';
ALTER USER 'data_foundry_backend'@'%' IDENTIFIED BY 'data_foundry_backend';

CREATE USER IF NOT EXISTS 'data_foundry_scheduler'@'localhost' IDENTIFIED BY 'data_foundry_scheduler';
CREATE USER IF NOT EXISTS 'data_foundry_scheduler'@'%' IDENTIFIED BY 'data_foundry_scheduler';
ALTER USER 'data_foundry_scheduler'@'localhost' IDENTIFIED BY 'data_foundry_scheduler';
ALTER USER 'data_foundry_scheduler'@'%' IDENTIFIED BY 'data_foundry_scheduler';

GRANT ALL PRIVILEGES ON data_foundry_backend.* TO 'data_foundry_backend'@'localhost';
GRANT ALL PRIVILEGES ON data_foundry_backend.* TO 'data_foundry_backend'@'%';
GRANT SELECT ON target_tables.* TO 'data_foundry_backend'@'localhost';
GRANT SELECT ON target_tables.* TO 'data_foundry_backend'@'%';
GRANT ALL PRIVILEGES ON data_foundry_scheduler.* TO 'data_foundry_scheduler'@'localhost';
GRANT ALL PRIVILEGES ON data_foundry_scheduler.* TO 'data_foundry_scheduler'@'%';

FLUSH PRIVILEGES;

USE data_foundry_backend;
SOURCE db/mysql/backend/001_schema.sql;

USE data_foundry_scheduler;
SOURCE db/mysql/scheduler/001_schema.sql;

-- Bootstrap an example target table (physical table) for schema linking.
-- Note: Linking != creating; app runtime never auto-creates tables in `target_tables`.
CREATE TABLE IF NOT EXISTS target_tables.ads_autodrive_safety (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'row id',
  company VARCHAR(255) NOT NULL COMMENT 'company',
  city VARCHAR(255) NOT NULL COMMENT 'city',
  biz_date DATE NOT NULL COMMENT 'business date (month end)',
  mpi_takeover_miles DECIMAL(18,2) NULL COMMENT 'mpi takeover miles',
  incident_rate DECIMAL(10,4) NULL COMMENT 'incident rate (per 1M km)',
  row_status VARCHAR(32) NOT NULL DEFAULT 'initialized' COMMENT 'row status',
  last_task_id VARCHAR(255) NULL COMMENT 'last task id',
  updated_at DATETIME NULL COMMENT 'updated at',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ads_autodrive_safety_scope (company, city, biz_date),
  KEY idx_ads_autodrive_safety_biz_date (biz_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='ads autodrive safety wide table';

