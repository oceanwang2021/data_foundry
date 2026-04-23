package com.huatai.datafoundry.backend.project.domain.repository;

import com.huatai.datafoundry.backend.project.domain.model.Project;
import java.util.List;

public interface ProjectRepository {
  List<Project> listProjects();

  Project getProject(String projectId);

  int insertProject(Project project);
}
