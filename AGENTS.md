# Agent Instructions (LiveKit)

## LiveKit Documentation (use MCP)
LiveKit Agents and related tooling evolve quickly. Always consult the latest LiveKit docs when implementing or changing LiveKit-related code.

For convenience, LiveKit provides an MCP server for browsing/searching their docs:

- MCP server URL: https://docs.livekit.io/mcp
- Transport: `http` (Streamable HTTP)

### Quick install examples
- Claude Code:
  - `claude mcp add --transport http livekit-docs https://docs.livekit.io/mcp`
- Codex:
  - `codex mcp add --url https://docs.livekit.io/mcp livekit-docs`
- Gemini CLI:
  - `gemini mcp add --transport http livekit-docs https://docs.livekit.io/mcp`

## Repo layout
- Frontend (Next.js): `apps/platform`
- Backend (FastAPI): `apps/backend` (Python package: `agent`)

## Backend run
From repo root:
- `cd apps/backend`
- `python -m uvicorn agent.main:app --reload --host 0.0.0.0 --port 8000`

Useful endpoints:
- `GET /hello`
- `GET /healthz`
- `POST /livekit/rooms` (requires LiveKit env vars)
