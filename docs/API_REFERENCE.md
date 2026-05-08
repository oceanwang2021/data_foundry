# Auto Search Agent — API 调用说明文档

## 基本信息

- 默认地址：`http://118.196.116.160:3005`
- 所有接口均返回 JSON，统一格式：
  ```json
  { "success": true, "data": { ... } }
  // 或错误时
  { "detail": "错误描述" }
  ```
- 无 Token 认证，用户身份通过 `user_id`（username 字符串）或 `user_id`（数字 ID）传递

---

## 一、核心搜索任务流程

搜索任务分两步：先创建任务，再通过 SSE 流式连接触发执行并接收进度。

### 1. 创建搜索任务

`POST /api/search`

**请求体：**

| 字段                        | 类型   | 必填 | 说明                                             |
| --------------------------- | ------ | ---- | ------------------------------------------------ |
| `query`                   | string | ✅   | 搜索查询内容                                     |
| `background`              | string | ❌   | 背景知识，帮助 LLM 理解上下文                    |
| `trace_id`                | string | ❌   | 自定义追踪 ID，不传则自动生成                    |
| `user_id`                 | string | ❌   | 用户账户名（username）                           |
| `max_iterations`          | int    | ❌   | 最大迭代次数 1-10，不传使用环境配置              |
| `prompt_template`         | string | ❌   | Prompt 模板名（不含 .yaml），不传用默认          |
| `require_schema_approval` | bool   | ❌   | 是否需要人工审核表结构，API 调用建议设 `false` |

**请求示例：**

```json
{
  "query": "2024年中国创新药市场规模及主要企业",
  "background": "关注国内上市创新药，重点关注肿瘤和自免领域",
  "user_id": "zhangsan",
  "max_iterations": 2,
  "require_schema_approval": false
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "task_id": "3f8a1c2d-4e5b-6789-abcd-ef0123456789",
    "trace_id": "trace_1706789012345_a1b2c3d4",
    "max_iterations": 2,
    "prompt_template": "default_prompts"
  }
}
```

---

### 2. SSE 流式执行任务（核心）

`GET /api/task/{task_id}/stream`

连接后任务立即开始执行，服务端通过 SSE 实时推送进度和结果。

**响应格式：** `text/event-stream`，每条消息格式为：

```
data: {"type": "...", ...}

```

**SSE 事件类型：**

| type             | 说明                       | 关键字段                                          |
| ---------------- | -------------------------- | ------------------------------------------------- |
| `start`        | 任务开始                   | `task_id`, `timestamp`                        |
| `step`         | 节点进度                   | `node`, `name`, `description`, `progress` |
| `token`        | LLM 流式 token             | `content`                                       |
| `schema_ready` | 表结构生成完毕（需审核时） | `schema_json`, `schema_markdown`              |
| `complete`     | 任务完成                   | `final_report`, `table_data`                  |
| `error`        | 任务失败                   | `message`                                       |
| `cancelled`    | 任务被取消                 | —                                                |
| `heartbeat`    | 心跳保活                   | `timestamp`                                     |

**step 节点名称：**

| node                 | 说明                 |
| -------------------- | -------------------- |
| `schema_analyzer`  | 需求分析，生成表结构 |
| `planner`          | 查询规划             |
| `worker`           | 并行搜索与处理       |
| `synthesizer`      | 数据合成             |
| `refiner`          | 质量审查             |
| `output_generator` | 输出生成             |

**SSE 事件示例：**

```
data: {"type": "start", "task_id": "3f8a1c2d-...", "timestamp": "2026-02-25T10:00:00"}

data: {"type": "step", "node": "schema_analyzer", "name": "需求分析", "description": "正在分析用户需求，生成目标表结构...", "progress": 10}

data: {"type": "token", "content": "根据您的查询"}

data: {"type": "complete", "final_report": "# 报告\n...", "table_data": [...]}
```

---

### 3. 获取任务状态

`GET /api/task/{task_id}/status`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "task_id": "3f8a1c2d-...",
    "trace_id": "trace_...",
    "query": "2024年中国创新药市场规模",
    "status": "completed",
    "progress": 100.0,
    "current_step": "output_generator",
    "completed_steps": ["schema_analyzer", "planner", "worker", "synthesizer", "refiner"],
    "created_at": "2026-02-25T10:00:00",
    "updated_at": "2026-02-25T10:05:30"
  }
}
```

`status` 枚举值：`pending` / `running` / `completed` / `failed`

---

### 4. 获取任务最终结果

`GET /api/task/{task_id}/result`

任务 `completed` 后可调用。

**响应示例：**

```json
{
  "success": true,
  "data": {
    "task_id": "3f8a1c2d-...",
    "query": "2024年中国创新药市场规模",
    "background": "...",
    "final_report": "# 2024年中国创新药市场分析\n\n## 市场规模\n...",
    "search_results": [
      {"title": "...", "url": "...", "content": "..."}
    ],
    "status": "completed",
    "created_at": "2026-02-25T10:00:00",
    "completed_at": "2026-02-25T10:05:30"
  }
}
```

---

### 5. 获取中间结果

`GET /api/task/{task_id}/intermediate-results`

**响应示例：**

```json
{
  "success": true,
  "data": {
    "task_id": "3f8a1c2d-...",
    "intermediate_results": [
      {
        "node_name": "schema_analyzer",
        "result_data": { "table_schemas": [...] },
        "created_at": "2026-02-25T10:00:10"
      }
    ],
    "count": 5
  }
}
```

`GET /api/task/{task_id}/intermediate-results/{node_name}` — 获取特定节点结果

---

### 6. 获取搜索结果

`GET /api/task/{task_id}/search-results?engine=tavily`

`engine` 可选，不传返回所有引擎结果。

**响应示例：**

```json
{
  "success": true,
  "data": {
    "task_id": "3f8a1c2d-...",
    "engine": "tavily",
    "search_results": [
      {
        "query": "中国创新药市场规模 2024",
        "engine": "tavily",
        "results": [{"title": "...", "url": "...", "content": "..."}]
      }
    ],
    "count": 12
  }
}
```

---

### 7. 取消任务

`POST /api/task/{task_id}/cancel`

**响应示例：**

```json
{
  "success": true,
  "data": { "message": "任务已取消" }
}
```

---

### 8. 获取任务列表

`GET /api/tasks?limit=20&user_id=1`

`GET /api/user/{user_id}/tasks?limit=50`

---

## 二、用户认证

### 注册

`POST /api/auth/register`

```json
// 请求
{ "username": "zhangsan", "password": "123456" }

// 响应
{
  "success": true,
  "data": { "id": 5, "username": "zhangsan", "created_at": "2026-02-25T10:00:00" }
}
```

### 登录

`POST /api/auth/login`

```json
// 请求
{ "username": "zhangsan", "password": "123456" }

// 响应
{
  "success": true,
  "data": { "id": 5, "username": "zhangsan", "last_login_at": "2026-02-25T10:00:00" }
}
```

### 管理员登录

`POST /api/auth/admin/login`

```json
// 请求（账号密码来自环境变量 ADMIN_USERNAME / ADMIN_PASSWORD）
{ "username": "admin", "password": "admin" }
```

### 检查用户名

`GET /api/auth/check-username/{username}`

```json
{ "success": true, "data": { "exists": false } }
```

---

## 三、系统信息

### 健康检查

`GET /api/health`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-25T10:00:00",
    "details": {
      "overall": true,
      "search_engines": { "tavily": true, "google": false }
    }
  }
}
```

### 系统信息

`GET /api/info`

```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "available_engines": ["tavily", "jina"],
    "total_tasks": 42,
    "active_tasks": 2
  }
}
```

---

## 四、YAML 配置管理

### 优化生成 YAML

`POST /api/yaml/optimize`

```json
// 请求
{
  "user_query": "采集各省2024年GDP数据",
  "background_info": "需要按季度拆分，来源为国家统计局",
  "user_id": "zhangsan"
}

// 响应
{
  "success": true,
  "data": {
    "yaml_content": "query: 采集各省2024年GDP数据\nbackground: ...",
    "saved_file": "yaml_templates/optimized_xxx.yaml",
    "timestamp": "2026-02-25T10:00:00"
  }
}
```

### 验证 YAML

`POST /api/yaml/validate`

```json
// 请求
{ "config_yaml": "query: ...\nbackground: ..." }

// 响应
{
  "success": true,
  "data": {
    "valid": true,
    "missing_fields": [],
    "background_issues": []
  }
}
```

### 保存 YAML 配置

`POST /api/yaml/save`

```json
{
  "config_yaml": "query: ...",
  "config_name": "GDP采集配置",
  "description": "各省GDP数据采集",
  "industry": "宏观经济",
  "user_id": "zhangsan"
}
```

### 获取模板列表

`GET /api/yaml/templates?user_id=5`

### 加载模板

`GET /api/yaml/templates/{template_id}?user_id=5`

`template_id` 格式：`builtin_ai_medical_v1` 或 `user_123`

---

## 五、表结构审核（Schema Approval）

当 `require_schema_approval=true` 时，SSE 会推送 `schema_ready` 事件，前端需调用此接口确认后流程才继续。

### 获取表结构

`GET /api/task/{task_id}/schema`

### 审核通过并继续

`POST /api/task/{task_id}/schema/approve`

```json
{
  "table_schema_data": {
    "schemas": [
      {
        "table_name": "drug_market",
        "columns": [
          { "name": "drug_name", "type": "string", "description": "药品名称" },
          { "name": "market_size", "type": "number", "description": "市场规模（亿元）" }
        ]
      }
    ],
    "scoped_targets": ["恒瑞医药", "百济神州"]
  }
}
```

---

## 六、完整调用代码示例

### Python（同步，适合批量脚本）

```python
import requests
import json

BASE_URL = "http://localhost:3000"

def run_search(query, background="", max_iterations=2, require_schema_approval=False):
    """完整搜索流程：创建任务 -> SSE 流式执行 -> 获取结果"""
  
    # 1. 创建任务
    resp = requests.post(f"{BASE_URL}/api/search", json={
        "query": query,
        "background": background,
        "max_iterations": max_iterations,
        "require_schema_approval": require_schema_approval
    })
    resp.raise_for_status()
    task_id = resp.json()["data"]["task_id"]
    print(f"任务已创建: {task_id}")
  
    # 2. SSE 流式执行
    with requests.get(
        f"{BASE_URL}/api/task/{task_id}/stream",
        stream=True,
        timeout=1800,
        headers={"Accept": "text/event-stream"}
    ) as sse_resp:
        buffer = ""
        for chunk in sse_resp.iter_content(chunk_size=1, decode_unicode=True):
            if not chunk:
                continue
            buffer += chunk
            while "\n\n" in buffer:
                msg, buffer = buffer.split("\n\n", 1)
                if "data: " not in msg:
                    continue
                try:
                    data = json.loads(msg.split("data: ", 1)[1])
                    t = data.get("type")
                    if t == "step":
                        print(f"  [{data['node']}] {data['description']}")
                    elif t == "complete":
                        print("任务完成")
                        break
                    elif t == "error":
                        raise RuntimeError(f"任务失败: {data['message']}")
                    elif t == "heartbeat":
                        pass  # 忽略心跳
                except json.JSONDecodeError:
                    pass
  
    # 3. 获取最终结果
    resp = requests.get(f"{BASE_URL}/api/task/{task_id}/result")
    result = resp.json()["data"]
    print(f"\n最终报告（前500字）:\n{result['final_report'][:500]}")
    return result

if __name__ == "__main__":
    result = run_search(
        query="2024年中国创新药市场规模及主要企业",
        background="重点关注肿瘤和自免领域，来源为公开财报和行业报告",
        max_iterations=2
    )
```

---

### Python（异步，适合高并发）

```python
import asyncio
import aiohttp
import json

BASE_URL = "http://localhost:3000"

async def run_search_async(query: str, background: str = "") -> dict:
    async with aiohttp.ClientSession() as session:
        # 1. 创建任务
        async with session.post(f"{BASE_URL}/api/search", json={
            "query": query,
            "background": background,
            "require_schema_approval": False
        }) as resp:
            data = await resp.json()
            task_id = data["data"]["task_id"]
      
        # 2. SSE 流式执行
        async with session.get(
            f"{BASE_URL}/api/task/{task_id}/stream",
            headers={"Accept": "text/event-stream"},
            timeout=aiohttp.ClientTimeout(total=1800)
        ) as sse_resp:
            buffer = ""
            async for chunk in sse_resp.content.iter_any():
                buffer += chunk.decode("utf-8")
                while "\n\n" in buffer:
                    msg, buffer = buffer.split("\n\n", 1)
                    if "data: " not in msg:
                        continue
                    try:
                        event = json.loads(msg.split("data: ", 1)[1])
                        if event["type"] == "step":
                            print(f"  [{event['node']}] {event['description']}")
                        elif event["type"] == "complete":
                            break
                        elif event["type"] == "error":
                            raise RuntimeError(event["message"])
                    except (json.JSONDecodeError, KeyError):
                        pass
      
        # 3. 获取结果
        async with session.get(f"{BASE_URL}/api/task/{task_id}/result") as resp:
            return (await resp.json())["data"]

async def main():
    # 并发执行多个搜索
    queries = [
        "恒瑞医药2024年营收",
        "百济神州2024年研发投入",
    ]
    results = await asyncio.gather(*[run_search_async(q) for q in queries])
    for r in results:
        print(r["final_report"][:200])

asyncio.run(main())
```

---

### JavaScript / Node.js

```javascript
const BASE_URL = "http://localhost:3000";

async function runSearch(query, background = "", maxIterations = 2) {
  // 1. 创建任务
  const createResp = await fetch(`${BASE_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      background,
      max_iterations: maxIterations,
      require_schema_approval: false,
    }),
  });
  const { data } = await createResp.json();
  const taskId = data.task_id;
  console.log(`任务已创建: ${taskId}`);

  // 2. SSE 流式执行
  await new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${BASE_URL}/api/task/${taskId}/stream`);

    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "step") {
        console.log(`  [${event.node}] ${event.description}`);
      } else if (event.type === "complete") {
        eventSource.close();
        resolve();
      } else if (event.type === "error") {
        eventSource.close();
        reject(new Error(event.message));
      }
    };

    eventSource.onerror = (err) => {
      eventSource.close();
      reject(err);
    };
  });

  // 3. 获取结果
  const resultResp = await fetch(`${BASE_URL}/api/task/${taskId}/result`);
  const result = await resultResp.json();
  return result.data;
}

// 使用示例
runSearch("2024年中国创新药市场规模", "重点关注肿瘤领域")
  .then((r) => console.log(r.final_report.slice(0, 500)))
  .catch(console.error);
```

---

### curl 快速测试

```bash
# 1. 创建任务
TASK_ID=$(curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"中国GDP 2024","require_schema_approval":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['task_id'])")

echo "Task ID: $TASK_ID"

# 2. SSE 流式执行（Ctrl+C 停止监听）
curl -N -H "Accept: text/event-stream" \
  "http://localhost:3000/api/task/$TASK_ID/stream"

# 3. 获取结果
curl "http://localhost:3000/api/task/$TASK_ID/result" | python3 -m json.tool

# 健康检查
curl http://localhost:3000/api/health | python3 -m json.tool
```

---

## 七、错误码说明

| HTTP 状态码 | 说明                                       |
| ----------- | ------------------------------------------ |
| 400         | 请求参数错误（如 max_iterations 超出范围） |
| 401         | 认证失败（管理员密码错误）                 |
| 404         | 资源不存在（task_id / template_id 无效）   |
| 500         | 服务器内部错误                             |

错误响应格式：

```json
{ "detail": "任务不存在" }
```

---

## 八、注意事项

1. SSE 连接是触发任务执行的关键，创建任务后必须建立 SSE 连接，任务才会开始运行
2. SSE 连接超时默认 1800 秒（30 分钟），服务端会定期发送 `heartbeat` 保活
3. `require_schema_approval=false` 适合纯 API 调用场景，跳过人工审核步骤
4. `user_id` 字段传的是 username 字符串（如 `"zhangsan"`），不是数字 ID
5. 任务结果仅在内存中保存，服务重启后需从数据库接口重新查询历史任务
