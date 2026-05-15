package com.huatai.datafoundry.backend.task.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CollectionResultMapper {
  @Insert({
      "insert into collection_results (",
      "  id, fetch_task_id, schedule_job_id, external_task_id, task_group_id, batch_id, wide_table_id, row_id,",
      "  raw_result_json, final_report, normalized_rows_json, status, error_msg, duration_ms, collected_at",
      ") values (",
      "  #{id}, #{fetchTaskId}, #{scheduleJobId}, #{externalTaskId}, #{taskGroupId}, #{batchId}, #{wideTableId}, #{rowId},",
      "  #{rawResultJson}, #{finalReport}, #{normalizedRowsJson}, #{status}, #{errorMsg}, #{durationMs}, #{collectedAt}",
      ") on duplicate key update ",
      "  external_task_id = values(external_task_id),",
      "  task_group_id = values(task_group_id),",
      "  batch_id = values(batch_id),",
      "  wide_table_id = values(wide_table_id),",
      "  row_id = values(row_id),",
      "  raw_result_json = values(raw_result_json),",
      "  final_report = values(final_report),",
      "  normalized_rows_json = values(normalized_rows_json),",
      "  status = values(status),",
      "  error_msg = values(error_msg),",
      "  duration_ms = values(duration_ms),",
      "  collected_at = values(collected_at),",
      "  updated_at = current_timestamp",
  })
  int upsertResult(CollectionResult result);

  @Delete("delete from collection_result_rows where collection_result_id = #{resultId}")
  int deleteRowsByResultId(@Param("resultId") String resultId);

  @Insert({
      "<script>",
      "insert into collection_result_rows (",
      "  id, collection_result_id, fetch_task_id, schedule_job_id, wide_table_id, row_id,",
      "  indicator_key, indicator_name, business_date, dimension_values_json, raw_value, cleaned_value,",
      "  unit, published_at, source_site, source_url, quote_text, max_value, min_value, confidence,",
      "  status, warning_msg, reasoning, why_not_found",
      ") values ",
      "  <foreach collection='rows' item='r' separator=','>",
      "    (#{r.id}, #{r.collectionResultId}, #{r.fetchTaskId}, #{r.scheduleJobId}, #{r.wideTableId}, #{r.rowId},",
      "     #{r.indicatorKey}, #{r.indicatorName}, #{r.businessDate}, #{r.dimensionValuesJson}, #{r.rawValue}, #{r.cleanedValue},",
      "     #{r.unit}, #{r.publishedAt}, #{r.sourceSite}, #{r.sourceUrl}, #{r.quoteText}, #{r.maxValue}, #{r.minValue}, #{r.confidence},",
      "     #{r.status}, #{r.warningMsg}, #{r.reasoning}, #{r.whyNotFound})",
      "  </foreach>",
      "on duplicate key update ",
      "  indicator_name = values(indicator_name),",
      "  business_date = values(business_date),",
      "  dimension_values_json = values(dimension_values_json),",
      "  raw_value = values(raw_value),",
      "  cleaned_value = values(cleaned_value),",
      "  unit = values(unit),",
      "  published_at = values(published_at),",
      "  source_site = values(source_site),",
      "  source_url = values(source_url),",
      "  quote_text = values(quote_text),",
      "  max_value = values(max_value),",
      "  min_value = values(min_value),",
      "  confidence = values(confidence),",
      "  status = values(status),",
      "  warning_msg = values(warning_msg),",
      "  reasoning = values(reasoning),",
      "  why_not_found = values(why_not_found),",
      "  updated_at = current_timestamp",
      "</script>",
  })
  int insertRows(@Param("rows") List<CollectionResultRow> rows);

  @Select(
      "select id, fetch_task_id, schedule_job_id, task_group_id, wide_table_id, row_id, "
          + "raw_result_json, final_report, normalized_rows_json, status "
          + "from collection_results where fetch_task_id = #{fetchTaskId} and id = #{resultId} limit 1")
  CollectionResult getResultByTaskAndId(
      @Param("fetchTaskId") String fetchTaskId, @Param("resultId") String resultId);

  @Update(
      "update collection_results set normalized_rows_json = #{normalizedRowsJson} "
          + "where fetch_task_id = #{fetchTaskId} and id = #{resultId}")
  int updateNormalizedRowsJson(
      @Param("fetchTaskId") String fetchTaskId,
      @Param("resultId") String resultId,
      @Param("normalizedRowsJson") String normalizedRowsJson);

  @Select(
      "select id, fetch_task_id, schedule_job_id, task_group_id, wide_table_id, row_id, "
          + "raw_result_json, final_report, normalized_rows_json, status "
          + "from collection_results where fetch_task_id = #{fetchTaskId} order by row_id asc, id asc")
  List<CollectionResult> listResultsByTask(@Param("fetchTaskId") String fetchTaskId);

  @Select(
      "select id, fetch_task_id, schedule_job_id, task_group_id, wide_table_id, row_id, "
          + "raw_result_json, final_report, normalized_rows_json, status "
          + "from collection_results where task_group_id = #{taskGroupId} order by row_id asc, id asc")
  List<CollectionResult> listResultsByTaskGroup(@Param("taskGroupId") String taskGroupId);

  @Select(
      "select id, fetch_task_id, schedule_job_id, task_group_id, wide_table_id, row_id, "
          + "raw_result_json, final_report, normalized_rows_json, status "
          + "from collection_results where wide_table_id = #{wideTableId} order by row_id asc, id asc")
  List<CollectionResult> listResultsByWideTable(@Param("wideTableId") String wideTableId);

  @Select(
      "select id, collection_result_id, fetch_task_id, schedule_job_id, wide_table_id, row_id, "
          + "indicator_key, indicator_name, business_date, dimension_values_json, raw_value, cleaned_value, "
          + "unit, published_at, source_site, source_url, quote_text, max_value, min_value, confidence, "
          + "status, warning_msg, reasoning, why_not_found, created_at, updated_at "
          + "from collection_result_rows where fetch_task_id = #{fetchTaskId} order by created_at desc, indicator_key asc")
  List<CollectionResultRow> listRowsByTask(@Param("fetchTaskId") String fetchTaskId);
}
