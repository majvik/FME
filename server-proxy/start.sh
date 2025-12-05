#!/bin/bash

cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🚀 Starting PNG Sequence Recorder..."
echo ""

# Open browser after a short delay
(sleep 2 && open http://localhost:4000 2>/dev/null || xdg-open http://localhost:4000 2>/dev/null) &

# Start server
npm start

