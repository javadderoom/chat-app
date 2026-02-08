# Chat App Deployment Guide

This guide explains how to properly deploy the chat application to avoid the database connection issues you were experiencing.

## Problem Summary

The original setup had several issues that caused intermittent database connection failures:

1. **Database schema not initialized**: The database tables weren't created automatically
2. **Poor connection handling**: No retry logic or proper connection pooling
3. **Timing issues**: Services started before database was fully ready
4. **No health checks**: Containers didn't verify they were working properly

## Solution Overview

The updated setup includes:

- Automatic database schema initialization
- Improved connection pooling and retry logic
- Proper health checks and startup ordering
- Better error handling and logging
- Automated deployment script

## Quick Start

### Option 1: Automated Deployment (Recommended)

Run the automated deployment script:

```powershell
.\deploy.ps1
```

This script will:
1. Stop any existing containers
2. Start PostgreSQL and wait for it to be healthy
3. Initialize the database schema
4. Start the backend and wait for it to be healthy
5. Start the frontend

### Option 2: Manual Deployment

If you prefer to deploy manually:

```bash
# Start all services (PostgreSQL will be initialized automatically)
docker-compose up -d

# Or initialize database first, then start services
docker-compose --profile init run --rm db-init
docker-compose up -d
```

## Key Improvements

### 1. Database Initialization
- Added a `db-init` service that runs `npm run db:push` to create tables
- Database schema is guaranteed to exist before the backend starts
- Uses Docker profiles to run initialization separately

### 2. Connection Handling
- Improved connection pool settings (max 20 connections, better timeouts)
- Automatic retry logic on connection failures
- Graceful handling of temporary connection drops
- Environment variable validation

### 3. Health Checks
- PostgreSQL health check verifies database is ready
- Backend health check tests the API endpoint
- Services wait for dependencies to be healthy before starting

### 4. Error Handling
- Better logging for connection issues
- Automatic reconnection attempts
- Proper error responses for API calls

## Troubleshooting

### Still getting database errors?

1. **Check container status:**
   ```bash
   docker-compose ps
   ```

2. **View logs:**
   ```bash
   docker-compose logs postgres
   docker-compose logs backend
   ```

3. **Reset everything:**
   ```bash
   docker-compose down -v  # Remove volumes too
   .\deploy.ps1
   ```

### Common Issues

**"Database connection failed"**
- Wait for the deployment script to complete
- Check that PostgreSQL container is healthy: `docker-compose ps postgres`

**"Tables don't exist"**
- Run the initialization: `docker-compose --profile init run --rm db-init`

**"Port already in use"**
- Stop other services using ports 80, 3000, 5432
- Or modify ports in `docker-compose.yml`

## Environment Variables

The application uses these environment variables (with defaults):

- `DB_HOST`: Database host (default: postgres)
- `DB_PORT`: Database port (default: 5432)
- `DB_USER`: Database user (default: postgres)
- `DB_PASSWORD`: Database password (default: postgres)
- `DB_NAME`: Database name (default: chat_app)

## Monitoring

After deployment, monitor your services:

```bash
# View all logs
docker-compose logs -f

# Check specific service
docker-compose logs -f backend

# Check resource usage
docker stats
```

## Production Considerations

For production deployment:

1. **Change default passwords** in `docker-compose.yml`
2. **Use environment files** instead of hardcoded values
3. **Add SSL/TLS** for database connections
4. **Configure proper logging** and monitoring
5. **Set up backups** for the PostgreSQL volume
6. **Use a reverse proxy** (nginx) for the frontend

## File Changes Made

The following files were modified to fix the issues:

- `docker-compose.yml`: Added initialization service and health checks
- `server/Dockerfile`: Added startup script and curl for health checks
- `server/db/index.js`: Improved connection pooling and error handling
- `server/server.js`: Added retry logic and better error handling
- `server/init.sql`: Additional database initialization
- `deploy.ps1`: Automated deployment script
- `DEPLOYMENT.md`: This documentation

The core application logic remains unchanged - only the deployment and connection handling were improved.
