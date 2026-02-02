FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1

WORKDIR /app/apps/ai-services

# Install system deps (psycopg binary works without libpq, but keeping ca-certs for https)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy ai-services source
COPY apps/ai-services/ ./

# Install Python deps
RUN python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir . \
  && python -m agent.voice_agent download-files

EXPOSE 8000

CMD ["python", "-m", "agent.voice_agent", "start"]

