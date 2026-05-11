SET NAMES utf8mb4;
USE data_foundry_backend;

-- 采集参数表短期采用最小改库方案：
-- 1. 手动录入、CSV/XLSX 文件导入的参数行继续复用 wide_table_rows.dimension_values_json 保存。
-- 2. SQL 导入来源保存在 wide_tables.scope_json.parameter_source 中，不新增单独表字段。
-- 3. 因此本轮不再新增 parameter_values_json、parameter_source、parameter_row_no、parameter_group_key 等字段。
-- 4. 文件导入元信息表的 file_type 需要放宽，否则 XLSX 标准 MIME 会超过 VARCHAR(64)。

ALTER TABLE wide_table_scope_imports
  MODIFY COLUMN file_type VARCHAR(128) NOT NULL
  COMMENT '导入文件类型或 MIME 类型，例如 text/csv、application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
