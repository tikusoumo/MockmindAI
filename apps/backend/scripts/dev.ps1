$ErrorActionPreference = 'Stop'

function Resolve-PythonPath {
    $candidates = @(
        (Join-Path $PSScriptRoot '..\.venv\Scripts\python.exe'),
        (Join-Path $PSScriptRoot '..\..\..\.venv\Scripts\python.exe')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Path
    }

    throw 'Python not found. Create a venv in apps/backend/.venv or ensure python is on PATH.'
}

$python = Resolve-PythonPath

$backendRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $backendRoot
try {
    & $python -m uvicorn agent.main:app --reload --host 0.0.0.0 --port 8000
} finally {
    Pop-Location
}
