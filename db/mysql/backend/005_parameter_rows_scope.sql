SET NAMES utf8mb4;
USE data_foundry_backend;

-- 采集参数表短期采用最小改库方案：
-- 1. 手动录入、CSV/XLSX 文件导入的参数行继续复用 wide_table_rows.dimension_values_json 保存。
-- 2. SQL 导入来源保存在 wide_tables.scope_json.parameter_source 中，不新增单独表字段。
-- 3. 因此本轮不再新增 parameter_values_json、parameter_source、parameter_row_no、parameter_group_key 等字段。
-- 4. 文件导入元信息表的 file_type 需要放宽，否则 XLSX 标准 MIME 会超过 VARCHAR(64)。

<<<<<<< HEAD
ALTER TABLE wide_table_scope_imports
  MODIFY COLUMN file_type VARCHAR(128) NOT NULL
  COMMENT '导入文件类型或 MIME 类型，例如 text/csv、application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
=======
ALTER TABLE wide_table_rows
  ADD COLUMN parameter_values_json JSON NULL
  COMMENT 'parameter row variables for placeholder substitution'
  AFTER dimension_values_json,
  ADD COLUMN parameter_source VARCHAR(32) NOT NULL DEFAULT 'manual'
  COMMENT 'manual/paste/csv/tsv/xlsx'
  AFTER parameter_values_json,
  ADD COLUMN parameter_row_no INT NULL
  COMMENT 'source row number from import input'
  AFTER parameter_source,
  ADD COLUMN parameter_group_key VARCHAR(255) NULL
  COMMENT 'group key for imported parameter rows'
  AFTER parameter_row_no;

ALTER TABLE wide_table_rows
  ADD INDEX idx_wtr_parameter_source (parameter_source),
  ADD INDEX idx_wtr_parameter_group_key (parameter_group_key);

UPDATE wide_table_rows
SET parameter_values_json = dimension_values_json
WHERE parameter_values_json IS NULL
  AND dimension_values_json IS NOT NULL;



CREATE TABLE IR_ADAS_COMPUTE_CONFIG (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
    COMNAME        VARCHAR(500)            COMMENT '公司名称',
    COMCODE        BIGINT                  COMMENT '公司代码（10位数字）',
    STATYEAR       VARCHAR(10)             COMMENT '统计年份',
    ALGODESC       VARCHAR(4000)           COMMENT '算法描述',
    COMPUTEPOWERDESC VARCHAR(4000)         COMMENT '算力描述',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IR_ADAS算力/算法配置表';


ALTER TABLE data_foundry_backend.wide_table_scope_imports MODIFY COLUMN file_type varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;
>>>>>>> d96d701aac56769c6603c90e955d216c90be466c
