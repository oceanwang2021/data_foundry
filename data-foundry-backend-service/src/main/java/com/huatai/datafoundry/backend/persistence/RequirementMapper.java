package com.huatai.datafoundry.backend.persistence;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface RequirementMapper {
  @Insert("insert into requirements (id, project_id, title, phase, status, schema_locked, owner, assignee, "
      + "business_goal, background_knowledge, business_boundary, delivery_scope, processing_rule_drafts, "
      + "collection_policy, data_update_enabled, data_update_mode) "
      + "values (#{id}, #{projectId}, #{title}, #{phase}, #{status}, #{schemaLocked}, #{owner}, #{assignee}, "
      + "#{businessGoal}, #{backgroundKnowledge}, #{businessBoundary}, #{deliveryScope}, #{processingRuleDrafts}, "
      + "#{collectionPolicy}, #{dataUpdateEnabled}, #{dataUpdateMode})")
  int insert(RequirementRecord record);

  @Select("select id, project_id, title, phase, status, schema_locked, owner, assignee, business_goal, "
      + "background_knowledge, business_boundary, delivery_scope, processing_rule_drafts, collection_policy, data_update_enabled, "
      + "data_update_mode, created_at, updated_at "
      + "from requirements where project_id = #{projectId} order by created_at desc")
  List<RequirementRecord> listByProject(@Param("projectId") String projectId);

  @Select("select id, project_id, title, phase, status, schema_locked, owner, assignee, business_goal, "
      + "background_knowledge, business_boundary, delivery_scope, processing_rule_drafts, collection_policy, data_update_enabled, "
      + "data_update_mode, created_at, updated_at "
      + "from requirements where project_id = #{projectId} and id = #{requirementId}")
  RequirementRecord get(
      @Param("projectId") String projectId,
      @Param("requirementId") String requirementId);

  @Select("select id, project_id, title, phase, status, schema_locked, owner, assignee, business_goal, "
      + "background_knowledge, business_boundary, delivery_scope, processing_rule_drafts, collection_policy, data_update_enabled, "
      + "data_update_mode, created_at, updated_at "
      + "from requirements where id = #{requirementId}")
  RequirementRecord getById(@Param("requirementId") String requirementId);

  @Update({
      "<script>",
      "update requirements",
      "<set>",
      "  <if test='title != null'>title = #{title},</if>",
      "  <if test='phase != null'>phase = #{phase},</if>",
      "  <if test='status != null'>status = #{status},</if>",
      "  <if test='schemaLocked != null'>schema_locked = #{schemaLocked},</if>",
      "  <if test='owner != null'>owner = #{owner},</if>",
      "  <if test='assignee != null'>assignee = #{assignee},</if>",
      "  <if test='businessGoal != null'>business_goal = #{businessGoal},</if>",
      "  <if test='backgroundKnowledge != null'>background_knowledge = #{backgroundKnowledge},</if>",
      "  <if test='businessBoundary != null'>business_boundary = #{businessBoundary},</if>",
      "  <if test='deliveryScope != null'>delivery_scope = #{deliveryScope},</if>",
      "  <if test='processingRuleDrafts != null'>processing_rule_drafts = #{processingRuleDrafts},</if>",
      "  <if test='collectionPolicy != null'>collection_policy = #{collectionPolicy},</if>",
      "  <if test='dataUpdateEnabled != null'>data_update_enabled = #{dataUpdateEnabled},</if>",
      "  <if test='dataUpdateMode != null'>data_update_mode = #{dataUpdateMode},</if>",
      "</set>",
      "where project_id = #{projectId} and id = #{id}",
      "</script>",
  })
  int updateByProjectAndId(RequirementRecord record);
}
