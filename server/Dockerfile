# Use a tiny version of Node.js
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first (to speed up future builds)
COPY package*.json ./
RUN npm install --production

# Copy the rest of your app code
COPY . .

# Your app uses port 3000
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]