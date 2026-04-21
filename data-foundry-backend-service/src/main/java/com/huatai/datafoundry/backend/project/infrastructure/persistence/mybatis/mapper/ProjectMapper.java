package com.huatai.datafoundry.backend.project.infrastructure.persistence.mybatis.mapper;

import com.huatai.datafoundry.backend.project.infrastructure.persistence.mybatis.record.ProjectRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ProjectMapper {
  @Select("select id, name, business_background, description, status, owner_team, data_source, created_at, updated_at "
      + "from projects order by created_at desc")
  List<ProjectRecord> listProjects();

  @Select("select id, name, business_background, description, status, owner_team, data_source, created_at, updated_at "
      + "from projects where id = #{id}")
  ProjectRecord getProject(@Param("id") String id);
}
