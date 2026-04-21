package com.huatai.datafoundry.backend.project.infrastructure.repository;

import com.huatai.datafoundry.backend.project.domain.model.Project;
import com.huatai.datafoundry.backend.project.domain.repository.ProjectRepository;
import com.huatai.datafoundry.backend.project.infrastructure.persistence.mybatis.mapper.ProjectMapper;
import com.huatai.datafoundry.backend.project.infrastructure.persistence.mybatis.record.ProjectRecord;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class MybatisProjectRepository implements ProjectRepository {
  private final ProjectMapper projectMapper;

  public MybatisProjectRepository(ProjectMapper projectMapper) {
    this.projectMapper = projectMapper;
  }

  @Override
  public List<Project> listProjects() {
    List<ProjectRecord> records = projectMapper.listProjects();
    if (records == null) return new ArrayList<Project>();
    List<Project> out = new ArrayList<Project>(records.size());
    for (ProjectRecord record : records) {
      if (record == null) continue;
      out.add(toDomain(record));
    }
    return out;
  }

  @Override
  public Project getProject(String projectId) {
    ProjectRecord record = projectMapper.getProject(projectId);
    return record != null ? toDomain(record) : null;
  }

  private static Project toDomain(ProjectRecord record) {
    Project p = new Project();
    p.setId(record.getId());
    p.setName(record.getName());
    p.setBusinessBackground(record.getBusinessBackground());
    p.setDescription(record.getDescription());
    p.setStatus(record.getStatus());
    p.setOwnerTeam(record.getOwnerTeam());
    p.setDataSourceJson(record.getDataSource());
    p.setCreatedAt(record.getCreatedAt());
    p.setUpdatedAt(record.getUpdatedAt());
    return p;
  }
}

