# =============================================================================
# Backend Dockerfile
# =============================================================================
# TEACHING NOTE:
#   Multi-stage builds are a best practice, but for a dev Dockerfile
#   we keep it simple. This installs Python dependencies and runs
#   the FastAPI server with auto-reload enabled.
# =============================================================================

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for psycopg2 and bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the API port
EXPOSE 8000

# Start the server - use PORT env var for Render, default 8000 for local dev
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
