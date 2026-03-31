# Data Foundry Agent

独立的采数 Agent mock 服务。它负责接收单个采集任务的上下文，返回 mock 指标结果和检索明细；业务后端只负责发请求和写回结果。

## 要求

- Python `3.12`
- `uv`

## 初始化

```bash
cd data-foundry-agent
make init
```

## 启动

```bash
cd data-foundry-agent
make run
```

默认端口是 `8100`，可通过 `make run PORT=8110` 覆盖。

## 测试

```bash
cd data-foundry-agent
make test
```

## 可选环境变量

- `AGENT_MOCK_FAILURE_RATE`
  - `0.0` 到 `1.0`
  - 默认 `0`
- `AGENT_MOCK_LATENCY_MS`
  - 默认 `120`
