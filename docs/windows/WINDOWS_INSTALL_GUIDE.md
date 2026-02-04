# OpenClaw Windows Native Installation Guide

> **Contributed by**: Community  
> **Tested on**: Windows 11 (no WSL)  
> **Date**: February 2026

## Overview

This guide documents how to install and run OpenClaw **natively on Windows** without requiring WSL2. While the official documentation recommends WSL2, native Windows installation is possible with some additional configuration.

## Prerequisites

- **Windows 10/11** (64-bit)
- **Node.js 20+** (LTS recommended)
- **npm** (comes with Node.js)
- **Git** (optional, for cloning)
- **PowerShell** (built into Windows)

## Installation Steps

### Step 1: Install Node.js

Download and install from [nodejs.org](https://nodejs.org/) (LTS version).

Verify installation:

```powershell
node --version  # Should show v20.x.x or higher
npm --version   # Should show 10.x.x or higher
```

### Step 2: Install OpenClaw

```powershell
npm install -g openclaw
```

### Step 3: Run the Onboarding Wizard

```powershell
openclaw onboard
```

Follow the prompts to:

- Select your AI model provider (GitHub Copilot is free!)
- Configure communication channels (Discord, WhatsApp, etc.)

### Step 4: Configure the Gateway

Add gateway configuration to `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "your-secure-token-here"
    }
  }
}
```

### Step 5: Start the Gateway

```powershell
$env:OPENCLAW_GATEWAY_TOKEN = "your-secure-token-here"
openclaw gateway --verbose
```

## Known Windows-Specific Issues

### Issue 1: Discord Integration Hang

**Symptom**: CLI hangs when Discord channel is configured.

**Cause**: The `@buape/carbon` package and Discord monitor imports can cause hangs on Windows due to module resolution differences.

**Workaround**: Ensure `discord.enabled: true` is set in config and run `openclaw doctor --fix` before starting the gateway.

### Issue 2: Missing Session Directory

**Symptom**: `CRITICAL: Session store dir missing` error.

**Fix**: Create the directory manually:

```powershell
mkdir -Force $env:USERPROFILE\.openclaw\agents\main\sessions
```

### Issue 3: Gateway Auth Token Required

**Symptom**: `Gateway auth is set to token, but no token is configured`

**Fix**: Set the environment variable before running:

```powershell
$env:OPENCLAW_GATEWAY_TOKEN = "local-dev-token"
openclaw gateway
```

Or add to config:

```json
{
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "local-dev-token"
    }
  }
}
```

## Discord Bot Setup

### 1. Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it (e.g., "OpenClaw Bot")

### 2. Create Bot User

1. Navigate to "Bot" in the sidebar
2. Click "Add Bot"
3. **Copy the Bot Token** (save it securely!)

### 3. Enable Intents

In the Bot settings, enable:

- ✅ PRESENCE INTENT
- ✅ SERVER MEMBERS INTENT
- ✅ MESSAGE CONTENT INTENT (required!)

### 4. Generate Invite URL

1. Go to OAuth2 → URL Generator
2. Select scopes: `bot`, `applications.commands`
3. Select permissions: Send Messages, Read Message History, Embed Links, Add Reactions
4. Copy the URL and open in browser to invite bot to your server

### 5. Configure OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "YOUR_BOT_TOKEN_HERE",
      "dm": {
        "allowFrom": ["*"]
      }
    }
  }
}
```

## Quick Start Command

After configuration, start everything with:

```powershell
$env:OPENCLAW_GATEWAY_TOKEN = "local-dev-token"
openclaw gateway --verbose
```

Your Discord bot should come online and respond to messages!

## Troubleshooting

| Issue            | Solution                                                   |
| ---------------- | ---------------------------------------------------------- |
| `node` not found | Reinstall Node.js, restart terminal                        |
| Bot offline      | Check gateway is running, verify token                     |
| No AI response   | Verify model config (use `github-copilot/claude-sonnet-4`) |
| Auth errors      | Run `openclaw doctor --fix`                                |

## Model Configuration

If you don't have Anthropic/OpenAI API keys, use GitHub Copilot (free with GitHub account):

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "github-copilot/claude-sonnet-4",
        "fallbacks": ["github-copilot/gpt-4o"]
      }
    }
  }
}
```

## Full Example Config

See `openclaw-windows-example.json` in this directory for a complete working configuration.
