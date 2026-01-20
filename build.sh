#!/bin/bash
set -e

echo "Installing yt-dlp..."
pip install yt-dlp

echo "Building backend..."
cd backend
npm install
npm run build
cd ..

echo "Build complete!"
