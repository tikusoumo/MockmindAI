FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  UV_COMPILE_BYTECODE=1 \
  UV_NO_CACHE=1

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app/apps/ai-services

# Install system deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy ai-services source
COPY apps/ai-services/ ./

# Install Python deps using uv (significantly faster than pip)
RUN uv pip install --system --no-cache . \
  && python -m agent.voice_agent download-files

CMD ["python", "-m", "agent.voice_agent", "start"]

