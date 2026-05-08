# Data Foundry Maven 启动脚本

本文档整理了使用 Maven 启动 Data Foundry 各个服务的命令。

## 项目结构

- **data-foundry-common-core**: 公共核心模块
- **data-foundry-common-contract**: 公共契约模块
- **data-foundry-backend-service**: 后端服务 (端口 8000)
- **data-foundry-scheduler-service**: 调度服务 (端口 8200)
- **data-foundry-agent-service**: Agent 服务 (端口 8100)
- **data-foundry-frontend**: 前端服务 (端口 3000)

## Maven 启动命令

### 1. 编译项目

```bash
# 首次启动需要先安装公共模块
mvn clean install -pl data-foundry-common-core,data-foundry-common-contract -DskipTests

# 或者编译整个项目
mvn clean install -DskipTests
```

### 2. 启动后端服务

```bash
# 方式 1: 使用命令行
mvn -pl data-foundry-backend-service -am spring-boot:run

# 方式 2: 使用批处理脚本
start-backend.cmd
```

**服务信息**:

- 端口: 8000
- 端点: http://localhost:8000
- 健康检查: http://localhost:8000/actuator/health
- 日志文件: `logs/backend-{timestamp}.out.log` 和 `logs/backend-{timestamp}.err.log`

### 3. 启动调度服务

```bash
# 方式 1: 使用命令行
mvn -pl data-foundry-scheduler-service -am spring-boot:run

# 方式 2: 使用批处理脚本
start-scheduler.cmd
```

**服务信息**:

- 端口: 8200
- 端点: http://localhost:8200
- 健康检查: http://localhost:8200/actuator/health
- 日志文件: `logs/scheduler-{timestamp}.out.log` 和 `logs/scheduler-{timestamp}.err.log`

### 4. 启动 Agent 服务

```bash
# 方式 1: 使用命令行
mvn -pl data-foundry-agent-service -am spring-boot:run

# 方式 2: 使用批处理脚本
start-agent.cmd
```

**服务信息**:

- 端口: 8100
- 端点: http://localhost:8100
- 健康检查: http://localhost:8100/actuator/health
- 日志文件: `logs/agent-{timestamp}.out.log` 和 `logs/agent-{timestamp}.err.log`

### 5. 启动前端服务

```bash
# 方式 1: 使用命令行 (PowerShell)
cd data-foundry-frontend
npm run dev

# 方式 2: 使用批处理脚本
start-frontend-dev.cmd
```

**服务信息**:

- 端口: 3000
- 端点: http://localhost:3000

### 6. 一键启动所有服务

```bash
# 使用批处理脚本 (会打开多个终端窗口)
start-all.cmd
```

**启动顺序**:

1. 前端服务 (端口 3000)
2. 后端服务 (端口 8000)
3. 调度服务 (端口 8200)
4. Agent 服务 (端口 8100)

## 停止服务

```bash
# 方式 1: 使用批处理脚本
stop-all.cmd

# 方式 2: 简单停止
stop-all-simple.cmd

# 方式 3: 手动停止
# 在运行服务的终端窗口按 Ctrl+C
```

## MySQL 数据库配置

### 数据库连接 URL

**后端服务** (`application.yml`):

```yaml
spring:
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/data_foundry_backend?useSSL=false&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true
    username: data_foundry_backend
    password: data_foundry_backend
```

**调度服务** (`application.yml`):

```yaml
spring:
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/data_foundry_scheduler?useSSL=false&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true
    username: data_foundry_scheduler
    password: data_foundry_scheduler
```

## 常用 Maven 命令

### 编译特定模块

```bash
mvn clean compile -pl data-foundry-backend-service
mvn clean compile -pl data-foundry-scheduler-service
mvn clean compile -pl data-foundry-agent-service
```

### 跳过测试编译

```bash
mvn clean compile -DskipTests
```

### 清理项目

```bash
mvn clean
mvn clean -pl data-foundry-backend-service
```

### 重新构建

```bash
mvn clean install -DskipTests
```

## 注意事项

1. **首次启动**: 需要先安装公共模块 (`data-foundry-common-core` 和 `data-foundry-common-contract`)
2. **Java 版本**: 项目要求 Java 8
3. **MySQL 配置**: 如果遇到 "Public Key Retrieval is not allowed" 错误，请在数据库连接 URL 中添加 `allowPublicKeyRetrieval=true`
4. **日志文件**: 所有服务的日志都会输出到 `logs/` 目录，文件名包含时间戳
5. **前端依赖**: 启动前端服务前需要先安装依赖: `npm install`
