-- Rebuild backend schema + load legacy sample data (MySQL)
--
-- WARNING: this will DROP tables in `data_foundry_backend` and reload sample data.
-- Run from repo root so `SOURCE db/...` paths resolve:
--   mysql -h 127.0.0.1 -P 3306 --protocol=TCP -u root -p < db/mysql/backend/004_rebuild_and_seed.sql

SET NAMES utf8mb4;

USE data_foundry_backend;
SOURCE db/mysql/backend/002_full_schema.sql;
SOURCE db/mysql/backend/003_seed_sample_data.sql;

