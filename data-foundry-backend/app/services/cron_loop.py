"""CronLoop — periodic scheduler trigger using asyncio background task."""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

CRON_CHECK_INTERVAL = 60  # seconds

_cron_task: asyncio.Task | None = None


async def _cron_loop(app: "FastAPI") -> None:
    """Run trigger_scheduled() every CRON_CHECK_INTERVAL seconds."""
    while True:
        try:
            await asyncio.sleep(CRON_CHECK_INTERVAL)
            scheduler = app.state.scheduler
            jobs = await scheduler.trigger_scheduled()
            if jobs:
                logger.info("CronLoop triggered %d schedule job(s)", len(jobs))
        except asyncio.CancelledError:
            logger.info("CronLoop cancelled, shutting down")
            break
        except Exception:
            logger.exception("CronLoop scan error (will retry next cycle)")


async def start_cron_loop(app: "FastAPI") -> None:
    """Start the background cron loop task."""
    global _cron_task
    _cron_task = asyncio.create_task(_cron_loop(app))
    logger.info("CronLoop started (interval=%ds)", CRON_CHECK_INTERVAL)


async def stop_cron_loop() -> None:
    """Gracefully stop the cron loop."""
    global _cron_task
    if _cron_task and not _cron_task.done():
        _cron_task.cancel()
        try:
            await _cron_task
        except asyncio.CancelledError:
            pass
    _cron_task = None
    logger.info("CronLoop stopped")
