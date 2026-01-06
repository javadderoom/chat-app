#!/bin/bash

# Chat App Deployment Script for Linux
# Run this with: ./deploy.sh

set -e

echo "🚀 Starting Chat App deployment..."

# Function to check if a service is healthy
check_service() {
    local service=$1
    local max_attempts=30
    local attempt=1

    echo "⏳ Waiting for $service to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if docker-compose ps $service | grep -q "healthy\|running"; then
            echo "✅ $service is ready!"
            return 0
        fi

        echo "   Attempt $attempt/$max_attempts: $service not ready yet..."
        sleep 10
        attempt=$((attempt + 1))
    done

    echo "❌ $service failed to start properly"
    return 1
}

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Start PostgreSQL first
echo "🐘 Starting PostgreSQL..."
docker-compose up -d postgres

# Wait for PostgreSQL to be healthy
if ! check_service postgres; then
    echo "❌ PostgreSQL failed to start. Check logs:"
    docker-compose logs postgres
    exit 1
fi

# Run database initialization
echo "🗄️  Initializing database schema..."
if docker-compose --profile init run --rm db-init; then
    echo "✅ Database schema initialized successfully"
else
    echo "❌ Database initialization failed"
    echo "📋 Checking db-init logs:"
    docker-compose logs db-init
    echo ""
    echo "🔍 Checking PostgreSQL logs:"
    docker-compose logs postgres
    exit 1
fi

# Start the backend
echo "⚙️  Starting backend service..."
docker-compose up -d backend

# Wait for backend to be healthy
if ! check_service backend; then
    echo "❌ Backend failed to start. Check logs:"
    docker-compose logs backend
    exit 1
fi

# Start the frontend
echo "🌐 Starting frontend service..."
docker-compose up -d frontend

echo ""
echo "🎉 Chat App deployment completed successfully!"
echo ""
echo "Services:"
echo "  • Frontend: http://localhost"
echo "  • Backend API: http://localhost:3000"
echo "  • Database: localhost:5432"
echo ""
echo "To view logs: docker-compose logs -f [service-name]"
echo "To stop: docker-compose down"
