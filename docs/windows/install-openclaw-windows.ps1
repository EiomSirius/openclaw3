# OpenClaw Windows Native Install Script
# Run in PowerShell as Administrator (optional but recommended)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Windows Native Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "  Then run this script again." -ForegroundColor Yellow
    exit 1
}

# Check npm
Write-Host "[2/5] Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "  ✓ npm installed: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ npm not found!" -ForegroundColor Red
    exit 1
}

# Install OpenClaw
Write-Host "[3/5] Installing OpenClaw..." -ForegroundColor Yellow
try {
    npm install -g openclaw
    Write-Host "  ✓ OpenClaw installed!" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to install OpenClaw" -ForegroundColor Red
    Write-Host "  Try running: npm install -g openclaw" -ForegroundColor Yellow
    exit 1
}

# Create directories
Write-Host "[4/5] Creating directories..." -ForegroundColor Yellow
$openclawDir = "$env:USERPROFILE\.openclaw"
$sessionsDir = "$openclawDir\agents\main\sessions"

if (!(Test-Path $openclawDir)) {
    New-Item -ItemType Directory -Path $openclawDir -Force | Out-Null
}
if (!(Test-Path $sessionsDir)) {
    New-Item -ItemType Directory -Path $sessionsDir -Force | Out-Null
}
Write-Host "  ✓ Directories created" -ForegroundColor Green

# Run onboard
Write-Host "[5/5] Ready for onboarding!" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Run: openclaw onboard" -ForegroundColor Yellow
Write-Host "  2. Configure your AI model and channels" -ForegroundColor Yellow
Write-Host "  3. Run: openclaw doctor --fix" -ForegroundColor Yellow
Write-Host "  4. Start gateway: openclaw gateway" -ForegroundColor Yellow
Write-Host ""
Write-Host "For Discord bot setup, see WINDOWS_INSTALL_GUIDE.md" -ForegroundColor Cyan
Write-Host ""

# Ask to run onboard
$runOnboard = Read-Host "Run 'openclaw onboard' now? (Y/n)"
if ($runOnboard -ne "n" -and $runOnboard -ne "N") {
    openclaw onboard
}
