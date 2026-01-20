FROM node:18-alpine

# Install ffmpeg (required by yt-dlp for audio/video processing)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node dependencies (includes yt-dlp via npm)
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
