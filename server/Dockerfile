# Use a tiny version of Node.js
FROM node:20-alpine

# Install wait4ports and curl for container orchestration and health checks
RUN apk update && apk add --no-cache wait4ports curl

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (to speed up future builds)
COPY package*.json ./
RUN npm install

# Copy the rest of your app code
COPY . .

# Create a startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Waiting for database to be ready..."' >> /app/start.sh && \
    echo 'wait4ports -t 60 tcp://$DB_HOST:$DB_PORT' >> /app/start.sh && \
    echo 'echo "Database is ready, starting application..."' >> /app/start.sh && \
    echo 'exec npm start' >> /app/start.sh && \
    chmod +x /app/start.sh

# Your app uses port 3000
EXPOSE 3000

# Use the startup script
CMD ["/app/start.sh"]