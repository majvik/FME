@echo off
cd /d "%~dp0"

echo =====================================================
echo   FIGMA MAKE EXPORTER - WEB VERSION
echo =====================================================
echo.

if not exist "node_modules\" (
    echo Installing dependencies...
    echo.
    call npm install
    echo.
)

echo Starting web server...
echo.
echo The browser will open automatically.
echo If not, go to: http://localhost:8080
echo.
echo Press Ctrl+C to stop the server.
echo =====================================================
echo.

start http://localhost:8080
call npm start

pause
