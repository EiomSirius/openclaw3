---
summary: "Use Groq's fast inference API with OpenClaw"
read_when:
  - You want to use Groq's high-speed LLM inference
  - You need a simple GROQ_API_KEY setup
title: "Groq"
---

# Groq

Groq provides **fast inference** for popular open-source models via their LPU (Language Processing Unit) infrastructure. It uses API keys for authentication and is compatible with the OpenAI API format. Create your API key in the Groq console.

## CLI setup

```bash
openclaw onboard --auth-choice groq-api-key
# or non-interactive
openclaw onboard --groq-api-key "$GROQ_API_KEY"
```

## Config snippet

```json5
{
  env: { GROQ_API_KEY: "gsk_..." },
  agents: { defaults: { model: { primary: "groq/llama3-70b-8192" } } },
}
```

## Notes

- Groq models are available as `groq/<model>` (examples: `groq/llama3-70b-8192`, `groq/mixtral-8x7b-32768`, `groq/gemma-7b-it`).
- Groq uses OpenAI-compatible APIs for easy integration.
- View available models and API keys in the [Groq console](https://console.groq.com/).
- Groq is also supported for audio transcription via [Deepgram integration](/providers/deepgram).