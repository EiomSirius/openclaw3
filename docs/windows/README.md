# OpenClaw Windows Native Installation

This directory contains resources for installing and running OpenClaw natively on Windows 11 (without WSL2).

## Files

| File                            | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `WINDOWS_INSTALL_GUIDE.md`      | Complete installation guide with troubleshooting |
| `install-openclaw-windows.ps1`  | One-click PowerShell install script              |
| `openclaw-windows-example.json` | Example configuration file                       |
| `start-openclaw.bat`            | Quick-start batch file for gateway               |

## Quick Start

### Option 1: PowerShell Script (Recommended)

```powershell
.\install-openclaw-windows.ps1
```

### Option 2: Manual Install

```powershell
npm install -g openclaw
openclaw onboard
openclaw doctor --fix
openclaw gateway
```

## Tested Configuration

- **OS**: Windows 11 (22H2+)
- **Node.js**: v20.x LTS
- **OpenClaw**: v2026.1.29
- **AI Model**: github-copilot/claude-sonnet-4

## Known Issues

See `WINDOWS_INSTALL_GUIDE.md` for detailed troubleshooting.

## Contributing

This native Windows support was community-contributed. If you find issues or improvements, please submit a PR or issue to the OpenClaw GitHub repository.

---

_Tested and documented by the community, February 2026_
