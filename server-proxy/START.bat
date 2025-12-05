@echo off
cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting PNG Sequence Recorder...
echo.
echo Open http://localhost:4000 in your browser
echo.

start "" http://localhost:4000
npm start
pause

