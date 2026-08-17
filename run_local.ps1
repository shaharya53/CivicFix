# CivicFix Local Services Runner
# Reads .env variables and launches the servers in separate windows.

if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

Write-Host "Loading environment variables from .env..." -ForegroundColor Cyan
Get-Content .env | Where-Object { $_ -match '=' -and -not $_.StartsWith('#') } | ForEach-Object {
    $parts = $_.Split('=', 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
}

# Override database URL details for local host execution
$db_user = $env:POSTGRES_USER
$db_pass = $env:POSTGRES_PASSWORD
$db_name = $env:POSTGRES_DB
$local_db_url = "postgresql://${db_user}:${db_pass}@127.0.0.1:5432/${db_name}"

# Set the active environment variables in the parent process so children inherit them
$env:POSTGRES_HOST = "127.0.0.1"
$env:DATABASE_URL = $local_db_url
$env:REDIS_URL = "redis://127.0.0.1:6379/0"
$env:AI_SERVICE_URL = "http://127.0.0.1:8001"

Write-Host "Local Database URL: $env:DATABASE_URL" -ForegroundColor Cyan

# Clean up port processes to avoid address-in-use conflicts
Write-Host "Cleaning up previous services..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000, 8000, 8001 -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($p -and $p.Name -ne "Idle" -and $p.Name -ne "System") {
            Stop-Process -Id $_.OwningProcess -Force
        }
    } catch {}
}

# 1. Start AI Service on port 8001
Write-Host "Launching AI Service (Port 8001)..." -ForegroundColor Green
$env:PORT = "8001"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd ai-service; python -m uvicorn main:app --host 127.0.0.1 --port 8001"

# 2. Start Backend API on port 8000
Write-Host "Launching Backend API (Port 8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; python -m uvicorn main:app --host 127.0.0.1 --port 8000"

# 3. Start Next.js Frontend on port 3000
Write-Host "Launching Next.js Frontend (Port 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "All services started in separate windows!" -ForegroundColor Green
Write-Host "Open http://localhost:3000 in your browser to view the app." -ForegroundColor Cyan
