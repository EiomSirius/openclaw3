# openclaw-env (MVP)

`openclaw-env` generates a **least-privilege** Docker Compose environment to run **OpenClaw fully inside containers**, scoped to a single project/workspace.

## Requirements

- Node.js >= 22
- Docker Desktop / Docker Engine + Docker Compose v2 (`docker compose`)

## Quick start

From a project directory:

1) Build an OpenClaw image locally (from the OpenClaw repo root):

```bash
docker build -t openclaw:local -f Dockerfile .
```

2) Initialize + run:

```bash
openclaw-env init
openclaw-env print
openclaw-env up
openclaw-env down
```

Files:

- `./openclaw.env.yml` — user-owned config (commit it)
- `./.openclaw-env/` — generated artifacts (gitignore it)

Note: `openclaw-env init` defaults `openclaw.image` to `openclaw:local`. You can change it to any existing image name/tag.

## What gets enforced

- **Filesystem**: only what you mount (workspace is `ro` by default)
- **Runtime hardening**: non-root user, read-only rootfs, `no-new-privileges`, `cap_drop: ["ALL"]`, tmpfs for `/tmp` + `/run` + `/state`
- **Network**:
  - `off`: `network_mode: "none"`
  - `restricted`: `openclaw` has **no direct egress**; only an `egress-proxy` sidecar can reach the Internet, and it enforces a **domain allowlist**
  - `full`: normal Docker networking

## Restricted networking caveats (MVP)

- The proxy enforces allowlists for **HTTP/HTTPS** only.
- The container is isolated by Docker networking, so `openclaw` cannot reach the Internet directly.
- Some clients/libraries do not respect `HTTP_PROXY`/`HTTPS_PROXY` automatically; in restricted mode those calls will fail unless they use the proxy.

## Safety gating

- **Hard error (no override)**: mounting `/var/run/docker.sock`
- **Requires `--i-know-what-im-doing`**: mounting your home dir, `/`, or common secret dirs (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config`, browser profiles)
- **Warning**: any `rw` mounts with `network.mode=full` (requires interactive confirmation; with `--yes`, pass `--accept-risk`)

