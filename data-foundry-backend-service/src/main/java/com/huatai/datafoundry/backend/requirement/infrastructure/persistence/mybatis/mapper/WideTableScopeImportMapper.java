package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableScopeImportRecord;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface WideTableScopeImportMapper {

  @Select(
      "select wide_table_id, requirement_id, import_mode, file_name, file_type, content_hash, row_count, "
          + "header_json, file_content, created_by, created_at, updated_at "
          + "from wide_table_scope_imports where wide_table_id = #{wideTableId} limit 1")
  WideTableScopeImportRecord getByWideTableId(@Param("wideTableId") String wideTableId);

  @Select({
      "<script>",
      "select wide_table_id, requirement_id, import_mode, file_name, file_type, content_hash, row_count, ",
      "header_json, file_content, created_by, created_at, updated_at ",
      "from wide_table_scope_imports ",
      "where wide_table_id in ",
      "<foreach collection='wideTableIds' item='wideTableId' open='(' separator=',' close=')'>",
      "#{wideTableId}",
      "</foreach>",
      "</script>",
  })
  List<WideTableScopeImportRecord> listByWideTableIds(@Param("wideTableIds") List<String> wideTableIds);

  @Insert(
      "insert into wide_table_scope_imports (wide_table_id, requirement_id, import_mode, file_name, file_type, "
          + "content_hash, row_count, header_json, file_content, created_by) "
          + "values (#{wideTableId}, #{requirementId}, #{importMode}, #{fileName}, #{fileType}, #{contentHash}, "
          + "#{rowCount}, #{headerJson}, #{fileContent}, #{createdBy}) "
          + "on duplicate key update "
          + "requirement_id = values(requirement_id), "
          + "import_mode = values(import_mode), "
          + "file_name = values(file_name), "
          + "file_type = values(file_type), "
          + "content_hash = values(content_hash), "
          + "row_count = values(row_count), "
          + "header_json = values(header_json), "
          + "file_content = values(file_content), "
          + "created_by = values(created_by), "
          + "updated_at = current_timestamp")
  int upsert(WideTableScopeImportRecord record);

  @Delete("delete from wide_table_scope_imports where wide_table_id = #{wideTableId}")
  int deleteByWideTableId(@Param("wideTableId") String wideTableId);
}
