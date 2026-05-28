package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.AcceptanceTicketRecord;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AcceptanceTicketMapper {
  String COLUMNS =
      "id, requirement_id, wide_table_id, task_group_id, scope_type, scope_key, dataset, owner, owner_account, reviewer, reviewer_account, "
          + "status, feedback, row_ids_json, publish_job_id, publish_error_msg, approved_at, published_at, "
          + "latest_action_at, created_at, updated_at";

  @Select({
      "<script>",
      "select " + COLUMNS + " from acceptance_tickets",
      "<where>",
      "  <if test='requirementId != null and requirementId != \"\"'>requirement_id = #{requirementId}</if>",
      "</where>",
      "order by coalesce(latest_action_at, updated_at, created_at) desc",
      "</script>",
  })
  List<AcceptanceTicketRecord> list(@Param("requirementId") String requirementId);

  @Select("select " + COLUMNS + " from acceptance_tickets where id = #{id} limit 1")
  AcceptanceTicketRecord getById(@Param("id") String id);

  @Select(
      "select " + COLUMNS + " from acceptance_tickets "
          + "where requirement_id = #{requirementId} and scope_type = #{scopeType} and scope_key = #{scopeKey} "
          + "limit 1")
  AcceptanceTicketRecord getByScope(
      @Param("requirementId") String requirementId,
      @Param("scopeType") String scopeType,
      @Param("scopeKey") String scopeKey);

  @Insert({
      "insert into acceptance_tickets (",
      "  id, requirement_id, wide_table_id, task_group_id, scope_type, scope_key, dataset, owner, owner_account, reviewer, reviewer_account,",
      "  status, feedback, row_ids_json, publish_job_id, publish_error_msg, approved_at, published_at, latest_action_at",
      ") values (",
      "  #{id}, #{requirementId}, #{wideTableId}, #{taskGroupId}, #{scopeType}, #{scopeKey}, #{dataset}, #{owner}, #{ownerAccount}, #{reviewer}, #{reviewerAccount},",
      "  #{status}, #{feedback}, #{rowIdsJson}, #{publishJobId}, #{publishErrorMsg}, #{approvedAt}, #{publishedAt}, #{latestActionAt}",
      ") on duplicate key update ",
      "  wide_table_id = values(wide_table_id),",
      "  task_group_id = values(task_group_id),",
      "  dataset = values(dataset),",
      "  owner = values(owner),",
      "  owner_account = values(owner_account),",
      "  reviewer = values(reviewer),",
      "  reviewer_account = values(reviewer_account),",
      "  status = values(status),",
      "  feedback = values(feedback),",
      "  row_ids_json = values(row_ids_json),",
      "  publish_job_id = values(publish_job_id),",
      "  publish_error_msg = values(publish_error_msg),",
      "  approved_at = values(approved_at),",
      "  published_at = values(published_at),",
      "  latest_action_at = values(latest_action_at),",
      "  updated_at = current_timestamp",
  })
  int upsert(AcceptanceTicketRecord record);

  @Update({
      "<script>",
      "update acceptance_tickets",
      "<set>",
      "  <if test='wideTableId != null'>wide_table_id = #{wideTableId},</if>",
      "  <if test='taskGroupId != null'>task_group_id = #{taskGroupId},</if>",
      "  <if test='dataset != null'>dataset = #{dataset},</if>",
      "  <if test='owner != null'>owner = #{owner},</if>",
      "  <if test='ownerAccount != null'>owner_account = #{ownerAccount},</if>",
      "  <if test='reviewer != null'>reviewer = #{reviewer},</if>",
      "  <if test='reviewerAccount != null'>reviewer_account = #{reviewerAccount},</if>",
      "  <if test='status != null'>status = #{status},</if>",
      "  <if test='feedback != null'>feedback = #{feedback},</if>",
      "  <if test='rowIdsJson != null'>row_ids_json = #{rowIdsJson},</if>",
      "  <if test='publishJobId != null'>publish_job_id = #{publishJobId},</if>",
      "  <if test='publishErrorMsg != null'>publish_error_msg = #{publishErrorMsg},</if>",
      "  <if test='approvedAt != null'>approved_at = #{approvedAt},</if>",
      "  <if test='publishedAt != null'>published_at = #{publishedAt},</if>",
      "  <if test='latestActionAt != null'>latest_action_at = #{latestActionAt},</if>",
      "  updated_at = current_timestamp",
      "</set>",
      "where id = #{id}",
      "</script>",
  })
  int update(AcceptanceTicketRecord record);
}
