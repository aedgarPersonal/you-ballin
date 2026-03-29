"""
Double Dribble - Application Entry Point
=========================================
Initializes FastAPI, registers routes, and starts the scheduler.

TEACHING NOTE:
    This is the "wiring" file that connects all the pieces:
    - Routes are registered as "routers" (modular endpoint groups)
    - CORS middleware allows the React frontend to make API calls
    - Lifespan events handle startup/shutdown logic
    - The scheduler is started for automated weekly tasks

    Run in development:
        uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
import app.models.rating  # noqa: F401 — ensure model is registered even without routes
from app.routes import (
    admin_routes,
    algorithm_routes,
    auth_routes,
    game_action_routes,
    game_routes,
    invite_routes,
    notification_routes,
    player_routes,
    push_routes,
    run_routes,
    stats_routes,
    vote_routes,
)
from app.services.scheduler import setup_scheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events.

    TEACHING NOTE:
        The 'lifespan' context manager replaces the deprecated
        @app.on_event("startup") and @app.on_event("shutdown") decorators.

        Everything before 'yield' runs at startup.
        Everything after 'yield' runs at shutdown.
    """
    # --- Startup ---
    logger.info("Starting Double Dribble application...")
    await init_db()
    setup_scheduler()
    logger.info("Application ready!")

    yield

    # --- Shutdown ---
    logger.info("Shutting down...")


# =============================================================================
# Create the FastAPI Application
# =============================================================================

app = FastAPI(
    title="Double Dribble",
    description="Pickup basketball game organizer with team balancing, player ratings, and automated scheduling.",
    version="1.0.0",
    lifespan=lifespan,
)


# =============================================================================
# Middleware
# =============================================================================

cors_origins = [settings.frontend_url]
if settings.backend_url.startswith("http://localhost"):
    cors_origins += ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Register Route Modules
# =============================================================================

app.include_router(auth_routes.router)
app.include_router(run_routes.router)
app.include_router(player_routes.router)
app.include_router(player_routes.run_players_router)
app.include_router(game_routes.router)
app.include_router(admin_routes.router)
app.include_router(admin_routes.run_admin_router)
app.include_router(notification_routes.router)
app.include_router(vote_routes.router)
app.include_router(vote_routes.awards_router)
app.include_router(algorithm_routes.router)
app.include_router(stats_routes.router)
app.include_router(game_action_routes.router)
app.include_router(push_routes.router)
app.include_router(invite_routes.public_router)
app.include_router(invite_routes.admin_router)


# =============================================================================
# Health Check
# =============================================================================

@app.get("/api/health")
async def health_check():
    """Simple health check endpoint.

    TEACHING NOTE:
        Health checks are used by load balancers and monitoring systems
        to verify the application is running. Keep it simple and fast.
    """
    return {"status": "healthy", "app": "Double Dribble"}
