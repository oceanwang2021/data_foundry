from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.repository import DataFoundryRepository
from app.routers import (
    backfill,
    fetch_tasks,
    platform_config,
    projects,
    requirements,
    schedule_jobs,
    task_groups,
    wide_table_rows,
    wide_tables,
)
from app.services.cron_loop import start_cron_loop, stop_cron_loop
from app.services.agent_service import CollectionAgentService
from app.services.scheduler_service import (
    DEFAULT_MAX_CONCURRENCY,
    SchedulerService,
    normalize_max_concurrency,
)


def create_app(db_path: str | Path | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        repository = DataFoundryRepository(db_path=db_path)
        repository.init_database()
        app.state.repository = repository

        # Initialize scheduler
        configured_max_concurrency = normalize_max_concurrency(
            repository.get_system_setting("max_concurrent_agent_tasks"),
            DEFAULT_MAX_CONCURRENCY,
        )
        semaphore = asyncio.Semaphore(configured_max_concurrency)
        agent_service = CollectionAgentService(repository)
        app.state.agent_service = agent_service
        app.state.scheduler = SchedulerService(
            repository,
            semaphore,
            agent_service,
            max_concurrency=configured_max_concurrency,
        )

        # Start cron loop
        await start_cron_loop(app)
        yield
        await stop_cron_loop()

    app = FastAPI(title="Data Foundry API", version="0.4.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(projects.router)
    app.include_router(requirements.router)
    app.include_router(wide_tables.router)
    app.include_router(wide_table_rows.router)
    app.include_router(task_groups.router)
    app.include_router(fetch_tasks.router)
    app.include_router(backfill.router)
    app.include_router(schedule_jobs.router)
    app.include_router(platform_config.router)

    return app


app = create_app()
