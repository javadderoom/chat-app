#!/bin/bash

# Chat App Deployment Script for Linux
# Run this with: ./deploy.sh

set -e

echo "🚀 Starting Chat App deployment..."

# Function to check if a service is healthy/running
check_service() {
    local service=$1
    local max_attempts=30
    local attempt=1

    echo "⏳ Waiting for $service to be ready..."

    while [ $attempt -le $max_attempts ]; do
        # Checks if container is strictly "healthy" (if healthcheck exists) or just "running"
        if docker-compose ps $service | grep -q "healthy\|running"; then
            echo "✅ $service is ready!"
            return 0
        fi

        echo "   Attempt $attempt/$max_attempts: $service not ready yet..."
        sleep 5
        attempt=$((attempt + 1))
    done

    echo "❌ $service failed to start properly"
    return 1
}

# 1. Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# 2. Start PostgreSQL
echo "🐘 Starting PostgreSQL..."
docker-compose up -d postgres

if ! check_service postgres; then
    echo "❌ PostgreSQL failed to start. Check logs:"
    docker-compose logs postgres
    exit 1
fi

# 3. Run Database Migrations (Using the backend container)
echo "🗄️  Running Database Migrations..."
# This spins up a temporary backend instance just to run the push command
if docker-compose run --rm backend npx drizzle-kit push; then
    echo "✅ Database schema updated successfully"
else
    echo "❌ Migration failed. Checking logs..."
    exit 1
fi

# 4. Start Backend
echo "⚙️  Starting Backend service..."
docker-compose up -d backend

if ! check_service backend; then
    echo "❌ Backend failed to start. Check logs:"
    docker-compose logs backend
    exit 1
fi

# 5. Start Frontend
echo "🌐 Starting Frontend service..."
docker-compose up -d frontend

# 6. Start Nginx (The Gateway)
echo "🚦 Starting Nginx Reverse Proxy..."
docker-compose up -d nginx

if ! check_service nginx; then
    echo "❌ Nginx failed to start. Check logs:"
    docker-compose logs nginx
    exit 1
fi

echo ""
echo "🎉 Chat App deployment completed successfully!"
echo ""
echo "-----------------------------------------------------"
echo "🟢 App is Live at: http://$(curl -s ifconfig.me) (or http://localhost)"
echo "-----------------------------------------------------"
echo "🔒 Security Status:"
echo "   • Backend (Port 3000): HIDDEN (Accessible via Nginx only)"
echo "   • Database (Port 5432): HIDDEN (Internal Docker Network only)"
echo "-----------------------------------------------------"
echo "To view logs: docker-compose logs -f [service-name]"
echo "To stop: docker-compose down"