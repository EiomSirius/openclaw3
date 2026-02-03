---
summary: "Use FLock AI decentralized models in OpenClaw"
read_when:
  - You want decentralized AI inference in OpenClaw
  - You want FLock AI setup guidance
  - You want community-validated models with on-chain metrics
title: "FLock.io"
---

# FLock.io

**FLock** is a decentralized AI training platform that combines federated learning with blockchain-based verification. Through its API Platform, developers get access to community-validated open-source models with transparent, on-chain performance metrics — all via an OpenAI-compatible API.

## Why FLock in OpenClaw

- **Community-driven**: Model catalog is curated and validated by the FLock community.
- **OpenAI-compatible**: Standard `/v1` endpoints — drop-in replacement for existing workflows.
- **Real usage analytics**: Built-in dashboard tracks requests, tokens, and cost per request.
- **FOMO tokenomics**: Model creators earn rewards when their models are used.

## How FLock Works

### Federated Learning + Blockchain

FLock solves two problems at once:

| Challenge                  | FLock's Solution                                                            |
| -------------------------- | --------------------------------------------------------------------------- |
| **Privacy in AI training** | Federated learning — data never leaves participants' devices                |
| **Trust in model quality** | Blockchain verification — all training contributions are validated on-chain |

Participants in FL Alliance are randomly assigned as **Proposers** (who train models using local data and submit updates) or **Voters** (who validate updates and aggregate contributions). This produces optimized global models from diverse data sources while maintaining data sovereignty.

### FOMO — FLock Open Model Offering

FOMO (FLock Open Model Offering) is FLock's tokenized incentive layer. Developers can launch models on the API Platform and earn `$FLOCK` and model-specific tokens when their models are used. Revenue from usage triggers a deflationary buy-back-and-burn mechanism, aligning incentives between model creators and consumers. For OpenClaw users, this means a growing model catalog driven by real economic incentives.

## Features

- **Decentralized model training**: Community-trained via federated learning with blockchain verification
- **OpenAI-compatible API**: Standard `/v1/chat/completions` endpoint
- **Standard parameters**: `temperature`, `max_tokens`, `top_p`, `frequency_penalty`, `presence_penalty`, `stop`, `seed`
- **Logprobs**: ✅ Token probability data available
- **API Playground**: Test models interactively at [platform.flock.io](https://platform.flock.io) before integrating

## Setup

### 1. Get API Key

1. Sign up at [platform.flock.io](https://platform.flock.io)
2. You'll be prompted to create an API key on first login
3. Select which models you want to access, then click **Create API**
4. **Copy your key immediately** — it won't be shown again

### 2. Configure OpenClaw

**Option A: CLI Setup (Recommended)**

```bash
openclaw onboard flock
```

This will prompt for your API key and configure the provider automatically.

**Option B: Environment Variable**

```bash
export FLOCK_API_KEY="sk-your-flock-api-key"
```

**Option C: Non-interactive**

```bash
openclaw onboard --non-interactive \
  --auth-choice flock-api-key \
  --flock-api-key "sk-your-flock-api-key"
```

### 3. Verify Setup

```bash
openclaw chat --model flock/kimi-k2.5 "Hello, are you working?"
```

## Model Selection

Pick based on your needs:

- **Default (our pick)**: `flock/kimi-k2.5` — 1T-parameter multimodal model with native vision and agentic capabilities.
- **Best for deep reasoning**: `flock/kimi-k2-thinking` or `flock/qwen3-235b-a22b-thinking-2507`.
- **Best for coding**: `flock/qwen3-30b-a3b-instruct-coding` — specialized for agentic coding tasks.
- **Lightweight / fast**: `flock/qwen3-30b-a3b-instruct-2507` — only 3.3B active params, runs efficiently.
- **Web3 / DeFi**: `flock/qwen3-235b-a22b-thinking-qwfin` — AI Arena fine-tune for financial tasks.

Change your default model anytime:

```bash
openclaw models set flock/kimi-k2.5
```

List all available models:

```bash
openclaw models list | grep flock
```

## Which Model Should I Use?

| Use Case                | Recommended Model                | Why                                                  |
| ----------------------- | -------------------------------- | ---------------------------------------------------- |
| **General chat**        | `kimi-k2.5`                      | 1T MoE, native multimodal, strong all-around         |
| **Deep reasoning**      | `kimi-k2-thinking`               | Thinking-only mode, 99.1% AIME 2025, 71.3% SWE-Bench |
| **Vision tasks**        | `kimi-k2.5`                      | Native MoonViT encoder, text + image + video         |
| **Agentic tasks**       | `kimi-k2.5`                      | Agent Swarm mode, up to 100 sub-agents               |
| **Coding**              | `qwen3-30b-a3b-instruct-coding`  | Specialized for agentic coding, 256K context         |
| **Math / Science**      | `qwen3-235b-a22b-thinking-2507`  | 92.3% AIME 2025, strong multi-step reasoning         |
| **Fast + lightweight**  | `qwen3-30b-a3b-instruct-2507`    | 3.3B active params, efficient inference              |
| **Finance**             | `qwen3-235b-a22b-thinking-qwfin` | AI Arena fine-tune for financial/on-chain tasks      |
| **General reasoning**   | `deepseek-v3.2`                  | 671B MoE, thinking + tool-use in one model           |
| **Multilingual coding** | `minimax-m2.1`                   | 74% SWE-Bench, Rust/Java/Go/C++/TS support           |

## Available Models (9)

### Kimi Models (Moonshot AI)

| Model ID           | Params (Total / Active) | Context | Key Capabilities                                           |
| ------------------ | ----------------------- | ------- | ---------------------------------------------------------- |
| `kimi-k2.5`        | 1T / 32B                | 256K    | Vision, Instant/Thinking/Agent/Swarm modes, multimodal     |
| `kimi-k2-thinking` | 1T / 32B                | 256K    | Deep reasoning, 200+ consecutive tool calls, thinking mode |

**Kimi K2.5** is an open-source native multimodal agentic model. Built via continual pretraining on ~15T mixed visual and text tokens atop the Kimi-K2-Base, it integrates vision (MoonViT 400M encoder) and language understanding with four operational modes: Instant, Thinking, Agent, and Agent Swarm (beta — self-directed up to 100 sub-agents, 1,500 tool calls). Modified MIT license.

**Kimi K2 Thinking** shares the same 1T MoE backbone but operates in thinking-only mode, optimized for deep multi-step reasoning with interleaved thinking and tool calls. Achieves 99.1% on AIME 2025 (with Python) and 71.3% on SWE-Bench Verified.

### Qwen3 Models (Alibaba Cloud)

| Model ID                         | Params (Total / Active) | Context | Key Capabilities                                     |
| -------------------------------- | ----------------------- | ------- | ---------------------------------------------------- |
| `qwen3-235b-a22b-thinking-2507`  | 235B / 22B              | 256K    | Deep reasoning (thinking mode always on)             |
| `qwen3-235b-a22b-instruct-2507`  | 235B / 22B              | 256K    | General instruction following, conversation          |
| `qwen3-235b-a22b-thinking-qwfin` | 235B / 22B              | 256K    | AI Arena fine-tune for Web3/finance tasks            |
| `qwen3-30b-a3b-instruct-2507`    | 30.5B / 3.3B            | 256K    | Lightweight general-purpose, efficient               |
| `qwen3-30b-a3b-instruct-coding`  | 30.5B / 3.3B            | 256K    | Specialized agentic coding, extendable to 1M context |

The **235B** models are the flagship Qwen3 MoE models (128 experts, 8 active per token, 94 layers). The Thinking-2507 variant scores 92.3% on AIME 2025. The **QwFin** variant is a community fine-tune from FLock's AI Arena, trained via federated learning for financial and on-chain tasks.

The **30B** models are the lightweight Qwen3 MoE series — only 3.3B active parameters, making them efficient for high-throughput inference. The Coding variant is specialized for agentic coding with support for up to 1M context via YaRN. Apache 2.0 license.

### Other Models

| Model ID        | Developer | Params (Total / Active) | Context | Key Capabilities                                         |
| --------------- | --------- | ----------------------- | ------- | -------------------------------------------------------- |
| `deepseek-v3.2` | DeepSeek  | 671B / 37B              | 131K    | Thinking + non-thinking, tool-use, coding, math          |
| `minimax-m2.1`  | MiniMax   | 230B / 10B              | 200K    | Interleaved thinking, multilingual coding, 74% SWE-Bench |

**DeepSeek V3.2** integrates thinking directly into tool-use — the first model to do so. It supports both thinking and non-thinking modes in a single model with DeepSeek Sparse Attention for efficient long-context processing. MIT license.

**MiniMax M2.1** achieves 74% on SWE-Bench Verified and excels at multilingual coding (Rust, Java, Go, C++, Kotlin, TypeScript). Runs on consumer hardware (dual RTX 4090). MIT license.

> **Note**: FLock's model catalog is community-driven and evolves over time. Models from AI Arena are continuously evaluated and top performers are promoted to the API Platform. Check [platform.flock.io](https://platform.flock.io) for the latest catalog.

## Streaming & Parameter Support

| Feature               | Support                           |
| --------------------- | --------------------------------- |
| **Streaming**         | ✅ All models                     |
| **temperature**       | ✅ Range 0–2                      |
| **max_tokens**        | ✅ Default: 16                    |
| **top_p**             | ✅ Nucleus sampling               |
| **frequency_penalty** | ✅ Range -2.0 to 2.0              |
| **presence_penalty**  | ✅ Range -2.0 to 2.0              |
| **stop**              | ✅ Stop sequences                 |
| **seed**              | ✅ Reproducible outputs           |
| **logprobs**          | ✅ Token probabilities            |
| **logit_bias**        | ✅ Token likelihood customization |
| **n**                 | ✅ Multiple completions           |

## AI Usage & Analytics

FLock's API Platform includes built-in analytics to track your real AI usage:

- **Usage Dashboard**: View total requests, total tokens consumed, and average cost per request.
- **Per-Model Metrics**: See which models are being used most and their performance characteristics.
- **Team Budgets**: Allocate budgets across team members and track consumption.
- **Real-Time Logs**: Monitor individual API calls with timestamps and token counts.

Access analytics via **Usage** tab in [platform.flock.io](https://platform.flock.io). This gives you visibility into actual inference costs and helps optimize your model selection based on real usage patterns.

## Pricing

FLock uses a credit-based billing system:

- Purchase credits via **Settings → Billing** (Stripe or Base payment supported)
- Some community models may be **free during promotional periods**
- Monitor real usage costs in the **Usage** tab (requests, tokens, cost per request)

Check [platform.flock.io](https://platform.flock.io) for current pricing details.

## Authentication Note

FLock uses a custom authentication header `x-litellm-api-key` instead of the standard `Authorization: Bearer` header. In most cases, OpenClaw's standard `apiKey` configuration handles this automatically via the underlying LiteLLM proxy. If you experience authentication issues, verify the header format.

## Comparison: FLock vs Traditional API Providers

| Aspect              | FLock                                               | Traditional Providers   |
| ------------------- | --------------------------------------------------- | ----------------------- |
| **Training**        | Decentralized federated learning                    | Centralized             |
| **Validation**      | On-chain metrics, community-verified                | Provider self-reported  |
| **Model catalog**   | Community-driven, includes AI Arena fine-tunes      | Provider-curated        |
| **Pricing**         | Credit-based                                        | Fixed per-token pricing |
| **Privacy**         | Federated — training data never leaves participants | Varies by provider      |
| **Usage analytics** | Built-in dashboard with real-time metrics           | Varies by provider      |

## Usage Examples

```bash
# Use Kimi K2.5 (default, multimodal)
openclaw chat --model flock/kimi-k2.5

# Use deep reasoning model
openclaw chat --model flock/kimi-k2-thinking

# Use coding model
openclaw chat --model flock/qwen3-30b-a3b-instruct-coding

# Use lightweight model for fast inference
openclaw chat --model flock/qwen3-30b-a3b-instruct-2507

# List available FLock models
openclaw models list | grep flock

# Set FLock as default provider
openclaw models set flock/kimi-k2.5
```

## Troubleshooting

### API key not recognized

```bash
echo $FLOCK_API_KEY
openclaw models list | grep flock
```

Ensure your key is valid. If lost, create a new key at [platform.flock.io](https://platform.flock.io) — old keys cannot be recovered.

### Model not available

The FLock model catalog is community-driven and updates dynamically. Models from AI Arena are promoted based on performance. Run `openclaw models list` to see currently available models.

### Authentication header issues

FLock uses `x-litellm-api-key` instead of `Authorization: Bearer`. OpenClaw handles this automatically in most cases. If you're getting 401 errors, verify your key is set correctly in the environment or config.

### Connection issues

FLock API is at `https://api.flock.io/v1`. Ensure your network allows HTTPS connections.

## Config File Example

```json
{
  "env": {
    "FLOCK_API_KEY": "sk-your-flock-api-key"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "flock/kimi-k2.5"
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "flock": {
        "baseUrl": "https://api.flock.io/v1",
        "apiKey": "${FLOCK_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "kimi-k2.5",
            "name": "Kimi K2.5",
            "reasoning": false,
            "input": ["text", "image"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
          {
            "id": "kimi-k2-thinking",
            "name": "Kimi K2 Thinking",
            "reasoning": true,
            "input": ["text"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
          {
            "id": "qwen3-235b-a22b-thinking-2507",
            "name": "Qwen3 235B Thinking",
            "reasoning": true,
            "input": ["text"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
          {
            "id": "qwen3-235b-a22b-instruct-2507",
            "name": "Qwen3 235B Instruct",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
          {
            "id": "qwen3-235b-a22b-thinking-qwfin",
            "name": "Qwen3 235B QwFin",
            "reasoning": true,
            "input": ["text"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
          {
            "id": "qwen3-30b-a3b-instruct-2507",
            "name": "Qwen3 30B Instruct",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
          {
            "id": "qwen3-30b-a3b-instruct-coding",
            "name": "Qwen3 30B Coder",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 262144,
            "maxTokens": 8192
          },
          {
            "id": "deepseek-v3.2",
            "name": "DeepSeek V3.2",
            "reasoning": true,
            "input": ["text"],
            "contextWindow": 131072,
            "maxTokens": 8192
          },
          {
            "id": "minimax-m2.1",
            "name": "MiniMax M2.1",
            "reasoning": true,
            "input": ["text"],
            "contextWindow": 204800,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

## Links

- [FLock API Platform](https://platform.flock.io)
- [FLock Documentation](https://docs.flock.io)
- [FLock Website](https://www.flock.io)
- [AI Arena (Model Training)](https://train.flock.io)
