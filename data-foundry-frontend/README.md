# 数据生产平台前端原型

这是仓库中的前端部分，基于 Next.js 13.5.x、React 18、TypeScript 和 Tailwind CSS 构建。它当前是一个可交互的产品原型，不是已经打通后端的完整业务系统。

## 当前定位

- 页面和流程当前以内置演示数据驱动。
- 一部分交互状态会保存到浏览器 `localStorage`。
- 当前没有直接调用 `data-foundry-backend/` 里的 FastAPI 接口。

## 当前主流程

应用首页 `/` 会重定向到 `/projects`。

### 侧边栏主导航

- `/projects`：项目列表与项目详情入口
- `/knowledge-base`：知识库概览
- `/scheduling`：调度记录与任务流转说明
- `/ops-monitoring`：运行监控与本地测试数据清理

### 项目与需求链路

主流程围绕下面这几类页面展开：

- `/projects`
- `/projects/[id]`
- `/projects/[id]/requirements/[reqId]`
- `/projects/[id]/requirements/[reqId]/tasks/[taskId]`

当前可体验的关键行为：

- 在项目页查看自动驾驶、创新药两个样例项目
- 在项目详情页创建 Demo 需求
- 只有当 Demo 需求状态为 `ready` 时，才能将该需求原地转换为正式需求
- 可以基于正式需求继续发起数据更新需求
- Demo 需求只有 `需求 / 采集任务 / 数据后处理` 三个 Tab
- 正式生产、数据更新需求增加 `数据稽核 / 数据验收`

## 各模块的真实行为

### 需求定义

当前 `需求` Tab 真实接入的是三部分：

- 基础信息
- 数据来源
- 范围定义

可编辑内容包括标题、类型、负责人、业务背景、搜索引擎、知识库、固定网页、时间范围、主体范围、指标列表等。

注意：

- “保存草稿”只保存到 `requirement-definition-draft-{requirementId}`。
- 草稿不会自动回写项目级需求列表。
- 页面里虽然保留了更多编辑器代码，但目前没有接到这个页面。

### 采集任务

`采集任务` Tab 支持：

- 依据当前需求创建本地任务
- 在任务创建弹窗里调整模型参数
- 在任务 Tab 维护目标表和字段结构 JSON
- Demo 任务转全量任务
- 全量任务转更新任务
- 手动拆分/手动创建子任务

当前限制：

- 本地新建任务只保存在 `generated-requirement-tasks-{requirementId}`。
- 本地任务没有详情页。
- 手动子任务当前只记录数量，不生成真实可查看的子任务明细。

### 数据后处理

- Demo 需求：只展示规则识别和处理前数据，可点击“Demo通过”
- 非 Demo 需求：展示规则开关、处理前数据、处理后数据

当前模拟流水线来自 `lib/requirement-data-pipeline.ts`，包括：

- 去除千分位
- `N/A` / `未披露` 归一化为 `NULL`
- 百分比转小数

### 数据稽核

对后处理后的模拟数据执行内置规则，当前规则主要覆盖：

- 数值阈值异常
- 来源链接缺失
- 值无法转数值或为 `NULL`

### 数据验收

根据稽核失败结果即时生成异常列表，支持：

- 编辑修复值
- 保存
- 删除
- 发起单条重采

注意：这些操作目前只存在页面内存里，刷新页面会重置。

## 其他可访问页面

仓内还保留了一批独立展示页，它们不在当前侧边栏主流程里：

- `/requirements`
- `/collection-tasks`
- `/preprocessing`
- `/quality-audit`
- `/acceptance`
- `/data-management`
- `/settings`

这些页面主要用于展示某个模块的独立原型，不代表已经和主流程完全打通。

## 本地状态说明

当前前端主要使用以下三类持久化键：

- `data-foundry:project-requirements:{projectId}`：项目级需求链路
- `requirement-definition-draft-{requirementId}`：单需求草稿
- `generated-requirement-tasks-{requirementId}`：本地新建任务

`/ops-monitoring` 页的“一键清空本地测试需求”会清掉这些数据。

## 开发启动

```bash
npm install
npm run dev
```

也可以使用：

```bash
make run
```

默认访问：[http://localhost:3000](http://localhost:3000)

## 推荐体验路径

1. 打开 `/projects`
2. 进入 `PROJ-001`
3. 创建一个 Demo 需求
4. 进入该需求，先体验 `需求` 和 `采集任务`
5. 在 `数据后处理` 中点击“Demo通过”
6. 回到项目详情页，将该 Demo 需求转换为正式需求
7. 进入转换后的正式需求继续查看 `数据稽核` 和 `数据验收`
8. 最后到 `/ops-monitoring` 清空本地测试数据

## 说明

- 当前没有接入后端 API。
- 任务详情页当前只支持仓内自带的演示任务。
- 仓库中还保留了一些未接入当前主流程的旧组件，例如 `DAGVisualizer`、`SchemaEditorModal`、`MermaidDiagram`。
