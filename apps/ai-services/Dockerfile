# syntax=docker/dockerfile:1.7
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  UV_COMPILE_BYTECODE=1

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app/apps/ai-services

# Install system deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first so dependency install can stay cached
COPY apps/ai-services/requirements.txt ./requirements.txt

# Install third-party deps (cached across source changes)
RUN --mount=type=cache,target=/root/.cache/uv \
  uv pip install --system -r requirements.txt

# Copy ai-services source
COPY apps/ai-services/ ./

# Install local package without re-installing third-party deps
RUN --mount=type=cache,target=/root/.cache/uv \
  uv pip install --system --no-deps .

# Optional model prefetch at build time. Keep disabled by default to avoid
# large downloads on every build.
ARG PRELOAD_MODELS=0
RUN --mount=type=cache,target=/root/.cache/huggingface \
  if [ "$PRELOAD_MODELS" = "1" ]; then \
    python -m agent.voice_agent download-files; \
  else \
    echo "Skipping model prefetch (PRELOAD_MODELS=0)"; \
  fi

CMD ["python", "-m", "agent.voice_agent", "start"]

