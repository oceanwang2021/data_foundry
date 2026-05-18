package com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.task.domain.model.MetricFieldMapping;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MetricFieldMappingMapper {
  @Select(
      "select id, requirement_id, wide_table_id, source_metric_name, target_indicator_key, "
          + "target_indicator_name, match_type, confidence, status, created_at, updated_at "
          + "from metric_field_mappings where wide_table_id = #{wideTableId} "
          + "order by source_metric_name asc, id asc")
  List<MetricFieldMapping> listByWideTable(@Param("wideTableId") String wideTableId);

  @Select(
      "select id, requirement_id, wide_table_id, source_metric_name, target_indicator_key, "
          + "target_indicator_name, match_type, confidence, status, created_at, updated_at "
          + "from metric_field_mappings where wide_table_id = #{wideTableId} and id = #{id} limit 1")
  MetricFieldMapping getByWideTableAndId(
      @Param("wideTableId") String wideTableId, @Param("id") String id);

  @Insert({
      "<script>",
      "insert into metric_field_mappings (",
      "  id, requirement_id, wide_table_id, source_metric_name, target_indicator_key,",
      "  target_indicator_name, match_type, confidence, status",
      ") values ",
      "  <foreach collection='mappings' item='m' separator=','>",
      "    (#{m.id}, #{m.requirementId}, #{m.wideTableId}, #{m.sourceMetricName}, #{m.targetIndicatorKey},",
      "     #{m.targetIndicatorName}, #{m.matchType}, #{m.confidence}, #{m.status})",
      "  </foreach>",
      "on duplicate key update ",
      "  requirement_id = values(requirement_id),",
      "  target_indicator_key = case when metric_field_mappings.status = 'pending' then values(target_indicator_key) else metric_field_mappings.target_indicator_key end,",
      "  target_indicator_name = case when metric_field_mappings.status = 'pending' then values(target_indicator_name) else coalesce(metric_field_mappings.target_indicator_name, values(target_indicator_name)) end,",
      "  match_type = case when metric_field_mappings.status = 'pending' then values(match_type) else metric_field_mappings.match_type end,",
      "  confidence = case when metric_field_mappings.status = 'pending' then values(confidence) else coalesce(metric_field_mappings.confidence, values(confidence)) end,",
      "  updated_at = current_timestamp",
      "</script>",
  })
  int upsertGenerated(@Param("mappings") List<MetricFieldMapping> mappings);

  @Update(
      "update metric_field_mappings set "
          + "target_indicator_key = #{targetIndicatorKey}, "
          + "target_indicator_name = #{targetIndicatorName}, "
          + "match_type = #{matchType}, "
          + "confidence = #{confidence}, "
          + "status = #{status}, "
          + "updated_at = current_timestamp "
          + "where wide_table_id = #{wideTableId} and id = #{id}")
  int updateMapping(MetricFieldMapping mapping);
}
