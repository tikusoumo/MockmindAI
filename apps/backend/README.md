# Backend (FastAPI + LiveKit)

## Requirements
- Python 3.11+

## Setup (venv)
From repo root:

```powershell
cd apps/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -U pip
pip install -e .
```

## Environment
Create `apps/backend/.env`:

```env
APP_ENV=dev
APP_HOST=0.0.0.0
APP_PORT=8000

# LiveKit
LIVEKIT_URL=https://your-livekit-host
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
```

## Run
```powershell
cd apps/backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn agent.main:app --reload --host 0.0.0.0 --port 8000
```

Open:
- http://localhost:8000/healthz
- http://localhost:8000/docs
