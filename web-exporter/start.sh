#!/bin/bash

# Get the directory where the script is located
cd "$(dirname "$0")"

echo "====================================================="
echo "   FIGMA MAKE EXPORTER - WEB VERSION"
echo "====================================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    echo ""
    npm install
    echo ""
fi

echo "Starting web server..."
echo ""
echo "The browser will open automatically."
echo "If not, go to: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop the server."
echo "====================================================="
echo ""

# Try to open browser (works on macOS and most Linux distros)
if command -v open &> /dev/null; then
    # macOS
    open http://localhost:8080 &
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open http://localhost:8080 &
fi

# Start the server
npm start

