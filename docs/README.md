# Data Foundry

Data Foundry 是一个面向“非结构化信息 -> 结构化数据”的数据生产平台原型仓库。当前仓库由两个部分组成：

- `data-foundry-frontend/`：Next.js 前端原型，负责演示项目、需求、任务、后处理、稽核、验收、知识库、调度和运维监控等页面。
- `data-foundry-backend/`：FastAPI + SQLite 后端，提供项目、需求、任务、检索子任务和运行记录接口。

当前实现更接近高保真产品原型，而不是完整生产系统：

- 前端主流程完全基于仓内 mock 数据和浏览器 `localStorage`。
- 后端接口是独立的静态示例服务。
- 前端目前没有接入后端 API。

## 仓库结构

```text
.
├── data-foundry-frontend/      # 前端原型（Next.js 13.5.x + React 18 + TypeScript）
├── data-foundry-backend/       # 后端 API（FastAPI + SQLite + uv, Python 3.12）
└── docs/                       # 方案与需求文档
```

## 当前代码里的真实能力

### 1. 前端主流程

主流程从 `/projects` 开始，`/` 会直接重定向到 `/projects`。

- 项目页：展示自动驾驶、创新药两个样例项目。
- 项目详情页：展示项目下的需求列表，并支持：
  - 创建 Demo 需求
  - 仅在 Demo 状态为 `ready` 时，将该需求原地转换为正式需求
  - 基于正式需求继续发起数据更新需求
- 需求详情页：
  - Demo 需求只有 3 个 Tab：`需求`、`采集任务`、`数据后处理`
  - 正式生产和数据更新需求有 5 个 Tab：`需求`、`采集任务`、`数据后处理`、`数据稽核`、`数据验收`
- 任务详情页：只支持查看仓内自带的预置任务；本地新建任务没有详情页。

### 2. 需求定义页现在到底能做什么

`/projects/[id]/requirements/[reqId]?tab=requirement` 当前真正开放的是三部分：

- 基础信息：标题、需求类型、负责人、更新频率、业务背景
- 数据来源：搜索引擎、站点策略、知识库、固定网页 URL
- 范围定义：业务时间范围、主体范围、指标列表、需求文件名

代码里虽然保留了更多编辑器能力（如数据库字段、Excel 规则、Query 模板编辑器），但它们当前没有接入这个页面，不应视为现有主流程能力。

### 3. 采集任务页的真实行为

`/projects/[id]/requirements/[reqId]?tab=tasks` 负责展示和创建任务，当前行为如下：

- 新建任务时默认继承当前需求配置。
- 可在创建任务弹窗里重定义模型参数。
- 数据结构定义（目标表、字段结构 JSON）已经迁移到任务 Tab 中维护。
- Demo 任务可以转为全量任务；全量任务可以继续派生更新任务。
- “手动拆分子任务 / 手动创建子任务”目前只记录数量，不生成可查看的真实子任务明细。
- 本地新建任务会保存在浏览器中，但不会进入后端，也没有任务详情页。

### 4. 后处理、稽核、验收的真实逻辑

- 数据后处理：
  - Demo 需求只做规则识别，并允许点击“Demo通过”
  - 非 Demo 需求会调用 `lib/requirement-data-pipeline.ts` 的模拟流水线，展示处理前/后对比
  - 当前模拟处理逻辑包括：去千分位、`N/A/未披露 -> NULL`、百分比转小数
- 数据稽核：
  - 对处理后的模拟数据逐条执行内置规则
  - 当前内置规则主要覆盖数值阈值、来源是否缺失、是否可转数值
- 数据验收：
  - 异常列表由稽核失败结果即时推导生成
  - 支持编辑修复值、保存、删除、发起单条重采
  - 这些操作仅保存在页面内存状态，刷新页面后会重置

### 5. 其他已存在页面

侧边栏当前直接暴露的页面有：

- `/projects`
- `/knowledge-base`
- `/scheduling`
- `/ops-monitoring`

另外仓内还保留了一批独立展示页，它们能运行，但不属于当前侧边栏主流程：

- `/requirements`
- `/collection-tasks`
- `/preprocessing`
- `/quality-audit`
- `/acceptance`
- `/data-management`
- `/settings`

这些页面大多直接读取共享样例数据或本页本地状态，用于展示某个子模块的独立原型。

### 6. 后端 API

后端当前使用 SQLite 存储，首次启动会自动创建数据库并写入符合 `数据模型.md` 的初始数据，当前内置：

- 2 个项目
- 3 个需求
- 4 张宽表
- 15 条宽表记录
- 4 个补采请求
- 8 个任务组
- 28 个采集任务
- 41 条单指标执行载体
- 7 条执行记录

已提供的接口：

- `GET /health`
- `GET /api/projects`
- `GET /api/projects/{project_id}`
- `GET /api/projects/{project_id}/requirements`
- `GET /api/projects/{project_id}/requirements/{requirement_id}`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/rows`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/backfill-requests`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/task-groups`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/tasks`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/tasks/{task_id}`
- `GET /api/tasks/{task_id}/retrieval-tasks`
- `GET /api/tasks/{task_id}/runs`

其中需求列表接口会额外返回宽表数、宽表记录数、任务组数、补采请求数等聚合统计；任务列表接口会返回检索载体数和运行次数。

## 技术栈

- 前端：Next.js 13.5.x、React 18、TypeScript、Tailwind CSS、Lucide React
- 后端：FastAPI、Pydantic v2、Uvicorn、uv
- Python：3.12

## 快速开始

### 1. 启动前端原型

```bash
cd data-foundry-frontend
npm install
npm run dev
```

默认访问：[http://localhost:3000](http://localhost:3000)

### 2. 启动后端 API

```bash
cd data-foundry-backend
uv venv --python 3.12
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

接口文档默认位于：[http://localhost:8000/docs](http://localhost:8000/docs)

## 推荐体验路径

建议按下面顺序体验，能最快对上当前代码里的真实逻辑：

1. 启动前端，进入 `/projects`。
2. 打开 `PROJ-001`（自动驾驶）项目详情页。
3. 点击“创建Demo需求”，观察项目级需求列表如何新增一条 Demo 需求。
4. 进入该 Demo 需求，先看 `需求` Tab，再到 `采集任务` Tab。
5. 切到 `数据后处理`，点击“Demo通过”，把状态改成 `ready`。
6. 回到项目详情页，执行“转为正式需求”。
7. 进入转换后的正式需求，继续体验 `数据稽核` 和 `数据验收`。
8. 最后访问 `/ops-monitoring`，使用“一键清空本地测试需求”恢复初始状态。

## 状态持久化边界

前端有多套本地状态，实际行为需要区分：

| 存储位置 | 作用 | 刷新后是否保留 |
| --- | --- | --- |
| `data-foundry:project-requirements:{projectId}` | 项目级需求列表；包括新建 Demo、转换正式需求、更新需求状态、Demo 通过状态 | 保留 |
| `requirement-definition-draft-{requirementId}` | 单个需求的编辑草稿 | 保留 |
| `generated-requirement-tasks-{requirementId}` | 当前需求下本地新建的采集任务 | 保留 |
| 组件内 `useState` | 稽核规则勾选、验收编辑、重采反馈、Demo 阶段后处理规则识别等 | 不保留 |

需要特别注意：

- “保存草稿”是单需求草稿，不会自动回写项目级需求列表。
- 项目详情页展示的需求链路，依赖的是项目级需求列表，不是每个需求自己的草稿。
- 运维页的“一键清空本地测试需求”会删除以上三类 `localStorage` 数据。

## 当前限制

- 前端不调用后端 API，前后端目前是并行存在的两个演示入口。
- 本地新建任务不会自动生成真实检索子任务，只会记录任务本身和手动子任务计数。
- 任务详情页只支持仓内自带的预置任务。
- 需求详情页里部分高级编辑器组件仍停留在代码中，但未接入当前 UI。
- 仓内存在一些旧原型组件（如 `DAGVisualizer`、`SchemaEditorModal`、`MermaidDiagram`），当前主流程没有使用。

## 相关文档

- `数据生产平台需求文档_MRD.md`
- `FEATURE_MATRIX.md`
- `数据模型.md`
- `AI采数平台技术方案.md`
- `目标宽表_指标与任务关系示意.xlsx`
