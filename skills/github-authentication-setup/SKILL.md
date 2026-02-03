---
name: github-authentication-setup
description: Set up GitHub authentication for OpenClaw using Personal Access Tokens (PAT). Use when users need to authenticate GitHub CLI or git operations on new machines, VMs, or CI environments. Includes step-by-step guide for creating fine-grained or classic tokens, configuring OpenClaw, testing authentication, and troubleshooting common issues.
---

# GitHub Authentication Setup

Complete guide for authenticating GitHub access using Personal Access Tokens (PAT).

## Why Personal Access Tokens?

- Works on headless VMs without interactive OAuth
- Easy to rotate and revoke
- Can scope to specific repos (fine-grained) or all repos (classic)
- Simple configuration in OpenClaw or environment variables

## Quick Setup

### 1. Create Token

**Fine-grained token (recommended):**  
https://github.com/settings/tokens?type=beta

**Classic token (for org repos):**  
https://github.com/settings/tokens

### 2. Configure OpenClaw

Add token to config:

```bash
openclaw gateway config.patch
```

```json
{
  "env": {
    "GH_TOKEN": "github_pat_11AAAAAA..."
  }
}
```

### 3. Verify

```bash
gh auth status
```

## Detailed Instructions

### Creating a Fine-Grained Token

Fine-grained tokens are more secure because you can limit them to specific repositories.

**Navigate to:** https://github.com/settings/tokens?type=beta

Or manually:
1. GitHub → Settings (top-right avatar)
2. Developer settings (bottom of left sidebar)
3. Personal access tokens → Fine-grained tokens
4. Click **Generate new token**

**Configure:**

- **Token name:** `openclaw-vm` (or descriptive name for where it's used)
- **Expiration:** `90 days` (recommended - forces rotation) or `No expiration` (less secure)
- **Repository access:**
  - **All repositories** - full access
  - **Only select repositories** - specific repos (more secure)

**Permissions:**

Under **Repository permissions**:
- **Contents:** `Read and write` (clone, commit, push)
- **Issues:** `Read and write` (create/edit issues)
- **Pull requests:** `Read and write` (create/manage PRs)
- **Workflows:** `Read and write` (trigger GitHub Actions, if needed)
- **Metadata:** `Read-only` (automatically included)

Under **Account permissions** (optional):
- **Gists:** `Read and write` (if using gists)

Click **Generate token** and **copy immediately** (won't see it again).

Token format: `github_pat_11AAAAAA...`

### Creating a Classic Token

Use classic tokens when fine-grained tokens don't work (e.g., some organization repos).

**Navigate to:** https://github.com/settings/tokens

**Configure:**

- **Note:** `openclaw-vm`
- **Expiration:** `90 days` or `No expiration`
- **Scopes:**
  - `repo` (full control of private repos)
  - `workflow` (update GitHub Actions)
  - `read:org` (read org data)
  - `gist` (if needed)

Token format: `ghp_...`

Classic tokens work across all repos but have broader permissions.

### Adding Token to OpenClaw

**Option 1: Using config.patch (recommended)**

```bash
openclaw gateway config.patch
```

Add this JSON:

```json
{
  "env": {
    "GH_TOKEN": "github_pat_11AAAAAA..."
  }
}
```

Gateway will restart automatically.

**Option 2: Manual edit**

Edit `~/.openclaw/openclaw.json`:

```json
{
  "env": {
    "GH_TOKEN": "github_pat_11AAAAAA...",
    "ANTHROPIC_API_KEY": "..."
  }
}
```

Then restart:

```bash
openclaw gateway restart
```

### Verifying Authentication

The `GH_TOKEN` environment variable is automatically picked up by `gh`:

```bash
gh auth status
```

Expected output:

```
✓ Logged in to github.com via GH_TOKEN
```

If needed, explicitly authenticate:

```bash
echo "github_pat_11AAAAAA..." | gh auth login --with-token
```

### Testing It Works

```bash
# List repos
gh repo list

# Clone a repo
gh repo clone username/repo

# Make a commit
cd repo
echo "test" >> README.md
git add README.md
git commit -m "Test commit"
git push
```

## Troubleshooting

### "Resource not accessible by personal access token"

Token doesn't have the right permissions.

**Fix:**  
Go to https://github.com/settings/tokens → Click your token → Edit → add missing permissions

### "Bad credentials"

Token expired or was revoked.

**Fix:**  
Generate a new token and update OpenClaw config.

### Git push asks for password

`gh` is authenticated but git isn't using the token.

**Fix:**

```bash
gh auth setup-git
```

Or configure HTTPS credential helper:

```bash
git config --global credential.helper store
echo "https://oauth2:github_pat_11AAA...@github.com" > ~/.git-credentials
```

### Token not recognized after config update

Gateway didn't restart properly.

**Fix:**

```bash
openclaw gateway restart
gh auth status
```

## Security Best Practices

- **Never commit tokens to repos**
- Store only in OpenClaw config or secure environment variables
- Use fine-grained tokens with minimal scope
- Set expiration and rotate regularly (90 days recommended)
- Revoke immediately if compromised: https://github.com/settings/tokens
- Use different tokens for different environments (local, VM, CI)

## Alternative: SSH Keys

For git operations only (not GitHub API), you can use SSH keys:

```bash
# Generate key
ssh-keygen -t ed25519 -C "your@email.com"

# Add to GitHub
cat ~/.ssh/id_ed25519.pub
# Paste at: https://github.com/settings/keys

# Configure gh to use SSH
gh config set git_protocol ssh
```

**Note:** SSH keys don't authenticate `gh` CLI API calls - you still need a PAT for those.
