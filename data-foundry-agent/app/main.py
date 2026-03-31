from __future__ import annotations

from fastapi import FastAPI

from app.mock_service import MockCollectionAgent
from app.schemas import AgentExecutionRequest, AgentExecutionResponse


def create_app() -> FastAPI:
    app = FastAPI(title="Data Foundry Agent", version="0.1.0")
    agent = MockCollectionAgent()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/agent/executions", response_model=AgentExecutionResponse)
    async def execute(request: AgentExecutionRequest) -> AgentExecutionResponse:
        return await agent.execute(request)

    return app


app = create_app()
