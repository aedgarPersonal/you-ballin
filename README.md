# 🏀 You Ballin

A full-stack web application for organizing pickup basketball games with automated team balancing, player ratings, and smart scheduling.

## What It Does

**You Ballin** manages the entire lifecycle of weekly pickup basketball games:

1. **Player Registration** — Players register and are approved by admins as either "regular" or "drop-in"
2. **Weekly Invitations** — Regular players receive automated invites (email, SMS, in-app) each week
3. **RSVP Management** — Players accept/decline with a 24-hour deadline
4. **Drop-in Spots** — Unclaimed spots open to drop-in players at 8 AM on game day (first come, first served)
5. **Team Balancing** — The system creates two fair teams using a multi-factor algorithm
6. **Game Results** — Admins record outcomes, which feed back into the "winner" rating for future balancing

## Architecture Overview

```
┌─────────────────────────┐     ┌──────────────────────────┐
│   React Frontend (SPA)  │────▶│   FastAPI Backend (API)   │
│   Vite + Tailwind CSS   │◀────│   SQLAlchemy + Pydantic   │
│   Port 5173             │     │   Port 8000               │
└─────────────────────────┘     └──────────┬───────────────┘
                                           │
                                ┌──────────▼───────────────┐
                                │      PostgreSQL          │
                                │      Port 5432           │
                                └──────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + Vite | Fast dev server, modern React with hooks |
| **Styling** | Tailwind CSS | Utility-first CSS, rapid UI development |
| **State** | Zustand | Minimal boilerplate vs Redux, easy to learn |
| **Backend** | FastAPI (Python) | Async, auto-docs, type-safe, great for learning |
| **ORM** | SQLAlchemy 2.0 (async) | Industry standard, powerful query builder |
| **Database** | PostgreSQL | Robust, full-featured relational database |
| **Auth** | JWT + bcrypt | Stateless auth, secure password hashing |
| **Scheduler** | APScheduler | Simple async job scheduling |
| **Notifications** | SMTP + Twilio | Email and SMS delivery |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16+ (or Docker)

### Option 1: Docker (Recommended)

```bash
# Clone the repo
git clone https://github.com/aedgarPersonal/you-ballin.git
cd you-ballin

# Copy environment config
cp .env.example .env

# Start everything
docker-compose up
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Option 2: Manual Setup

**Backend:**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp ../.env.example ../.env
# Edit .env with your PostgreSQL credentials

# Run the server
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

## Project Structure

```
you-ballin/
├── backend/
│   ├── app/
│   │   ├── auth/              # Authentication (JWT, passwords, dependencies)
│   │   │   ├── dependencies.py  # FastAPI auth dependencies
│   │   │   ├── jwt.py           # Token creation & verification
│   │   │   └── password.py      # bcrypt hashing
│   │   ├── models/            # SQLAlchemy database models
│   │   │   ├── user.py         # User, roles, player status
│   │   │   ├── game.py         # Games and RSVPs
│   │   │   ├── team.py         # Team assignments and results
│   │   │   ├── rating.py       # Anonymous player ratings
│   │   │   └── notification.py # Notification records
│   │   ├── routes/            # API endpoint handlers
│   │   │   ├── auth_routes.py   # Register, login, OAuth, magic links
│   │   │   ├── game_routes.py   # Game CRUD, RSVPs, teams
│   │   │   ├── player_routes.py # Player profiles
│   │   │   ├── rating_routes.py # Anonymous rating system
│   │   │   ├── admin_routes.py  # Admin management
│   │   │   └── notification_routes.py
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── services/          # Business logic
│   │   │   ├── team_balancer.py      # ⭐ Team balancing algorithm
│   │   │   ├── notification_service.py # Email/SMS/in-app delivery
│   │   │   └── scheduler.py          # Automated weekly tasks
│   │   ├── config.py          # Environment configuration
│   │   ├── database.py        # Database connection setup
│   │   └── main.py            # Application entry point
│   ├── alembic/               # Database migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/               # Backend API client functions
│   │   ├── components/        # Reusable React components
│   │   │   └── layout/        # Navbar, etc.
│   │   ├── pages/             # Page-level components
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── GamesPage.jsx
│   │   │   ├── GameDetailPage.jsx
│   │   │   ├── PlayersPage.jsx
│   │   │   ├── PlayerProfilePage.jsx
│   │   │   ├── AdminPage.jsx
│   │   │   └── NotificationsPage.jsx
│   │   ├── stores/            # Zustand state management
│   │   ├── App.jsx            # Route definitions
│   │   └── main.jsx           # React entry point
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## Key Concepts for Learning

### 1. Team Balancing Algorithm (`backend/app/services/team_balancer.py`)

The most interesting piece of the codebase. Uses a **weighted composite score** + **snake draft** + **swap optimization**:

```
Player Score = 0.35 × Overall + 0.20 × Winner + 0.15 × Offense
             + 0.15 × Defense + 0.05 × Height + 0.05 × Age + 0.05 × Mobility
```

- **Snake Draft**: Alternates pick direction each round (1st pick → Team A, 2nd → Team B, 3rd → Team B, 4th → Team A, ...)
- **Swap Optimization**: After drafting, tries all possible player swaps between teams, keeping any swap that reduces the score gap

### 2. Authentication System (`backend/app/auth/`)

Implements three auth strategies:
- **Email/Password**: Traditional registration with bcrypt hashing
- **Google OAuth**: Verify Google ID tokens server-side
- **Magic Links**: Short-lived JWT tokens sent via email

### 3. Game Lifecycle (`backend/app/services/scheduler.py`)

Automated weekly flow:
```
Sunday 6 PM → Create game, invite regular players
Game Day 8 AM → Open unclaimed spots to drop-in players
Game Day 6 PM → Generate balanced teams, notify everyone
After Game → Admin records result, winner ratings update
```

### 4. Anonymous Rating System (`backend/app/routes/rating_routes.py`)

- Each player can rate any other player (offense, defense, overall on 1-5 scale)
- Ratings are anonymous (rater_id stored for cooldown enforcement but never exposed)
- Updates limited to once per 30 days per player-rater pair
- Cached averages on the User model avoid expensive aggregation queries

### 5. State Management (`frontend/src/stores/`)

Uses Zustand for minimal-boilerplate global state:
- **authStore**: JWT token + user data, persisted to localStorage
- **notificationStore**: In-app notification feed with polling

## API Documentation

FastAPI auto-generates interactive API docs:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Environment Variables

See `.env.example` for all configuration options. Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://postgres:password@localhost:5432/you_ballin` |
| `SECRET_KEY` | JWT signing key | `change-me-in-production` |
| `DEFAULT_GAME_DAY` | 0=Mon...6=Sun | `2` (Wednesday) |
| `DEFAULT_GAME_TIME` | 24h format | `19:00` |
| `GAME_ROSTER_SIZE` | Spots per game | `16` (5v5 + 3 subs/team) |

## License

MIT
