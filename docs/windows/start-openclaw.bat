@echo off
REM OpenClaw Quick Start for Windows
REM Double-click this file to start the gateway

echo ========================================
echo   Starting OpenClaw Gateway
echo ========================================
echo.

SET OPENCLAW_GATEWAY_TOKEN=local-dev-token-2026
openclaw gateway --verbose

pause
