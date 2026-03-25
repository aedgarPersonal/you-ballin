# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

You Ballin is a full-stack app for organizing pickup basketball games with automated team balancing, player ratings, and smart scheduling. **Backend** is Python/FastAPI, **frontend** is React/Vite.

## Development Commands

### Full stack (Docker)
```bash
docker-compose up          # Start all services (Postgres, Redis, backend, frontend)
```

### Backend (manual)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                # Vite dev server on :5173 (proxies /api to :8000)
npm run build              # Production build
```

### Database seeding
```bash
cd backend
python seed_test_runs.py   # Populate test data
python seed_monday_run.py  # Create specific Monday run
```

## Architecture

### Backend (`backend/app/`)
- **FastAPI** with async SQLAlchemy 2.0 + asyncpg (PostgreSQL)
- **Routes** are modular routers in `routes/` — each domain (auth, runs, games, players, ratings, votes, algorithm, notifications) is a separate file registered in `main.py`
- **Auth**: JWT (HS256) via `auth/jwt.py`, bcrypt passwords via `auth/password.py`, Google OAuth, magic links. Dependencies in `auth/dependencies.py` (`get_current_user`, `require_run_admin`, `require_run_member`)
- **Models** in `models/` — SQLAlchemy ORM with relationships. Key entities: User, Run, RunMembership, Game, RSVP, TeamAssignment, GameResult, PlayerRating, AlgorithmWeight, CustomMetric, Vote
- **Schemas** in `schemas/` — Pydantic request/response validation
- **Services**: `team_balancer.py` (snake draft + swap optimization), `notification_service.py` (Resend email, Twilio SMS, in-app), `scheduler.py` (APScheduler for weekly game lifecycle)
- **Config**: `config.py` uses Pydantic Settings to load env vars
- **Database**: `database.py` — async engine with special Supabase pooler handling (NullPool, no prepared statements for pgbouncer)

### Frontend (`frontend/src/`)
- **React 18** + React Router 6 + **Zustand** for state management
- **Stores** (`stores/`): `authStore.js` (JWT + user, persisted to localStorage), `runStore.js` (current run context + admin flag), `notificationStore.js`, `themeStore.js`
- **API client** (`api/client.js`): Axios with JWT auto-attach interceptor and 401→logout handling. Domain-specific API files in `api/`
- **Pages** in `pages/`, components in `components/`. `App.jsx` defines routes with `<ProtectedRoute>` and `<AdminRoute>` wrappers
- **Styling**: Tailwind CSS with custom "court" color palette (orange-based), dark mode via class toggle. Custom component classes (`.btn-primary`, `.card`, `.input`, etc.) in `index.css` `@layer components`

### Key Domain Concepts
- **Run**: A recurring game series (e.g., "Wednesday Night Hoops") with its own roster, admins, settings, and algorithm weights
- **Everything is run-scoped**: memberships, stats, ratings, algorithm config, admin permissions
- **Game lifecycle**: SCHEDULED → INVITES_SENT → DROPIN_OPEN → TEAMS_SET → COMPLETED/CANCELLED
- **Team balancing**: Composite score (weighted: overall 35%, jordan_factor/win_rate 20%, offense 15%, defense 15%, height/age/mobility 5% each) → snake draft → swap optimization. Admins can adjust weights and add custom metrics
- **Player statuses per run**: PENDING, REGULAR, DROPIN, INACTIVE

### API URL Pattern
Backend routes are nested: `/api/runs/{run_id}/games/`, `/api/runs/{run_id}/players/`, etc. The Vite dev server proxies `/api/*` to `localhost:8000`.

## Deployment
- **Render.com** via `render.yaml` (backend only — frontend served separately or as static build)
- Database: Supabase PostgreSQL (uses connection pooler with pgbouncer)
- Docker images: `backend/Dockerfile` (Python 3.12-slim), `frontend/Dockerfile` (Node.js)
