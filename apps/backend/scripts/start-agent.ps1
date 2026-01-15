# Start LiveKit Voice Agent Worker
# Run this after starting the FastAPI server

Write-Host "Starting LiveKit Voice Agent Worker..." -ForegroundColor Green

# Activate virtual environment if not already active
if (-not $env:VIRTUAL_ENV) {
    if (Test-Path ".\.venv\Scripts\Activate.ps1") {
        Write-Host "Activating virtual environment..." -ForegroundColor Yellow
        & .\.venv\Scripts\Activate.ps1
    } else {
        Write-Host "Virtual environment not found. Please run setup first." -ForegroundColor Red
        exit 1
    }
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "Warning: .env file not found. Please create one from .env.example" -ForegroundColor Yellow
}

# Start the agent worker
Write-Host "Starting worker..." -ForegroundColor Cyan
python -m agent.voice_agent
