# Chat App Deployment Script for Windows
# Run this with: .\deploy.ps1

param(
    [switch]$Force
)

Write-Host "🚀 Starting Chat App deployment..." -ForegroundColor Green

# Function to check if a service is healthy
function Test-ServiceHealth {
    param([string]$ServiceName, [int]$MaxAttempts = 30)

    Write-Host "⏳ Waiting for $ServiceName to be ready..." -ForegroundColor Yellow

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $status = docker-compose ps $ServiceName 2>$null
        if ($status -and ($status -match "healthy|running")) {
            Write-Host "✅ $ServiceName is ready!" -ForegroundColor Green
            return $true
        }

        Write-Host "   Attempt $attempt/$MaxAttempts`: $ServiceName not ready yet..." -ForegroundColor Gray
        Start-Sleep -Seconds 10
    }

    Write-Host "❌ $ServiceName failed to start properly" -ForegroundColor Red
    return $false
}

# Stop any existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
docker-compose down

# Start PostgreSQL first
Write-Host "🐘 Starting PostgreSQL..." -ForegroundColor Yellow
docker-compose up -d postgres

# Wait for PostgreSQL to be healthy
if (!(Test-ServiceHealth -ServiceName "postgres")) {
    Write-Host "❌ PostgreSQL failed to start. Check logs:" -ForegroundColor Red
    docker-compose logs postgres
    exit 1
}

# Run database initialization
Write-Host "🗄️  Initializing database schema..." -ForegroundColor Yellow
$initResult = docker-compose --profile init run --rm db-init 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database schema initialized successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Database initialization failed" -ForegroundColor Red
    Write-Host $initResult -ForegroundColor Red
    docker-compose logs db-init
    exit 1
}

# Start the backend
Write-Host "⚙️  Starting backend service..." -ForegroundColor Yellow
docker-compose up -d backend

# Wait for backend to be healthy
if (!(Test-ServiceHealth -ServiceName "backend")) {
    Write-Host "❌ Backend failed to start. Check logs:" -ForegroundColor Red
    docker-compose logs backend
    exit 1
}

# Start the frontend
Write-Host "🌐 Starting frontend service..." -ForegroundColor Yellow
docker-compose up -d frontend

Write-Host "" -ForegroundColor Green
Write-Host "🎉 Chat App deployment completed successfully!" -ForegroundColor Green
Write-Host "" -ForegroundColor Green
Write-Host "Services:" -ForegroundColor Cyan
Write-Host "  • Frontend: http://localhost" -ForegroundColor White
Write-Host "  • Backend API: http://localhost:3000" -ForegroundColor White
Write-Host "  • Database: localhost:5432" -ForegroundColor White
Write-Host "" -ForegroundColor Green
Write-Host "To view logs: docker-compose logs -f [service-name]" -ForegroundColor Yellow
Write-Host "To stop: docker-compose down" -ForegroundColor Yellow
