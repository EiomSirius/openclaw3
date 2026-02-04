---
summary: "Run OpenClaw with Azure AI Foundry (Azure-hosted OpenAI & Anthropic models)"
read_when:
  - You want to run OpenClaw with Azure AI Foundry
  - You need Azure OpenAI or Azure-hosted Anthropic model setup
  - You want to use Azure credits with OpenClaw
title: "Azure AI Foundry"
---

# Azure AI Foundry

Azure AI Foundry provides enterprise-grade access to OpenAI and Anthropic models through Azure. OpenClaw ships a built-in catalog of common Azure models and supports both OpenAI-compatible and Anthropic-compatible endpoints under a single API key.

## Quick start

1. Set your Azure AI Foundry API key:

```bash
export AZURE_AI_FOUNDRY_API_KEY="your-azure-api-key"
```

2. Set your endpoint(s) — one or both:

```bash
# OpenAI-compatible endpoint (GPT-5 series, etc.)
export AZURE_FOUNDRY_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/openai/v1/"

# Anthropic-compatible endpoint (Claude series)
export AZURE_FOUNDRY_ANTHROPIC_ENDPOINT="https://your-resource.openai.azure.com/anthropic"
```

3. Use Azure models in your config:

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "azure-ai-foundry-anthropic/claude-opus-4-5-20251101",
        fallback: ["azure-ai-foundry/gpt-5.2"],
      },
    },
  },
}
```

OpenClaw auto-registers a catalog of common Azure models (Claude 4.5 series, GPT-5 series, GPT-4.1 series, o3/o4 reasoning models) when it detects the API key and at least one endpoint.

## How it works

### Built-in model catalog

When `AZURE_AI_FOUNDRY_API_KEY` and an endpoint are set, OpenClaw registers models from a built-in catalog using standard Azure model IDs:

**Anthropic models** (via `azure-ai-foundry-anthropic`):

- `claude-opus-4-5-20251101`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`
- `claude-sonnet-4-20250514`, `claude-3-7-sonnet-20250219`
- `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`

**OpenAI models** (via `azure-ai-foundry`):

- `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- `gpt-4o`, `gpt-4o-mini`
- `o3`, `o3-mini`, `o4-mini`

If your Azure deployment uses custom names (e.g., `my-gpt5-deployment`), use explicit config instead (see below).

### Two providers, one key

Azure AI Foundry exposes two API styles under the same resource:

| Provider ID                  | API                  | Endpoint env var                   |
| ---------------------------- | -------------------- | ---------------------------------- |
| `azure-ai-foundry`           | `openai-completions` | `AZURE_FOUNDRY_OPENAI_ENDPOINT`    |
| `azure-ai-foundry-anthropic` | `anthropic-messages` | `AZURE_FOUNDRY_ANTHROPIC_ENDPOINT` |

Both use the same `AZURE_AI_FOUNDRY_API_KEY` for authentication.

### Authentication

The key is resolved from (in order):

1. Auth profiles
2. `AZURE_AI_FOUNDRY_API_KEY` env var
3. `AZURE_FOUNDRY_API_KEY` env var (fallback)
4. `AZURE_OPENAI_API_KEY` env var (fallback)

## Configuration

### Custom deployment names

If your Azure deployments use custom names instead of standard model IDs, define them explicitly in `openclaw.json`:

```json5
{
  models: {
    providers: {
      "azure-ai-foundry-anthropic": {
        baseUrl: "https://your-resource.openai.azure.com/anthropic",
        apiKey: "${AZURE_AI_FOUNDRY_API_KEY}",
        api: "anthropic-messages",
        models: [
          {
            id: "my-claude-opus-deployment",
            name: "Claude Opus 4.5 (Azure)",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
      "azure-ai-foundry": {
        baseUrl: "https://your-resource.openai.azure.com/openai/v1/",
        apiKey: "${AZURE_AI_FOUNDRY_API_KEY}",
        api: "openai-completions",
        models: [
          {
            id: "my-gpt5-deployment",
            name: "GPT 5.2 (Azure)",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 16384,
          },
        ],
      },
    },
  },
}
```

Explicit config overrides the built-in catalog for that provider.

### Model costs

When using Azure credits (e.g., sponsorship or enterprise agreement), costs default to `0`. If you're on pay-as-you-go, override costs in your explicit model config to match Azure pricing.

## Troubleshooting

### Models not showing up

Ensure both components are set:

1. `AZURE_AI_FOUNDRY_API_KEY` (or fallback env vars)
2. At least one endpoint (`AZURE_FOUNDRY_OPENAI_ENDPOINT` or `AZURE_FOUNDRY_ANTHROPIC_ENDPOINT`)

```bash
# Verify your env vars
env | grep AZURE
openclaw models list
```

### Model not found errors

If your Azure deployment uses a custom name (e.g., `claude-opus-4-5-eastus2` instead of `claude-opus-4-5-20251101`), the built-in catalog won't match. Use explicit `models.providers` config with your deployment name as the model `id`.

### Authentication errors

Azure uses `api-key` header, not `Authorization: Bearer`. If you get 401 errors, verify your API key and endpoint URL match your Azure resource.

### Unsupported parameters

Some parameters may not be supported by Azure endpoints. If you see parameter errors, try explicit model config with `compat` flags to drop unsupported parameters.

## See Also

- [Model Providers](/concepts/model-providers) - Overview of all providers
- [Model Selection](/concepts/models) - How to choose models
- [Configuration](/gateway/configuration) - Full config reference
