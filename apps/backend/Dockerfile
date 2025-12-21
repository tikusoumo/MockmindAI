FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/apps/backend

# Install system deps (psycopg binary works without libpq, but keeping ca-certs for https)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy backend source
COPY apps/backend/ ./

# Install Python deps
RUN python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir .

EXPOSE 8000

CMD ["sh", "-c", "alembic -c alembic.ini upgrade head && python -m agent.seed && python -m uvicorn agent.main:app --host 0.0.0.0 --port 8000"]
