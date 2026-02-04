import type { VoiceCallTtsConfig } from "./config.js";
import type { CoreConfig } from "./core-bridge.js";
import { createCartesiaTtsProvider } from "./providers/tts-cartesia.js";
import { convertPcmToMulaw8k } from "./telephony-audio.js";

export type TelephonyTtsRuntime = {
  textToSpeechTelephony: (params: {
    text: string;
    cfg: CoreConfig;
    prefsPath?: string;
  }) => Promise<{
    success: boolean;
    audioBuffer?: Buffer;
    sampleRate?: number;
    provider?: string;
    error?: string;
  }>;
};

export type TelephonyTtsProvider = {
  synthesizeForTelephony: (text: string) => Promise<Buffer>;
  /** Streaming variant - yields chunks as they arrive for immediate forwarding */
  synthesizeForTelephonyStreaming?: (text: string) => AsyncGenerator<Buffer>;
};

export function createTelephonyTtsProvider(params: {
  coreConfig: CoreConfig;
  ttsOverride?: VoiceCallTtsConfig;
  runtime: TelephonyTtsRuntime;
}): TelephonyTtsProvider {
  const { coreConfig, ttsOverride, runtime } = params;

  // Cartesia outputs mu-law 8kHz directly - no conversion needed
  // Also supports streaming for immediate chunk forwarding (~90ms TTFA)
  if (ttsOverride?.provider === "cartesia") {
    const cartesiaProvider = createCartesiaTtsProvider({
      apiKey: ttsOverride.cartesia?.apiKey,
      modelId: ttsOverride.cartesia?.modelId,
      voiceId: ttsOverride.cartesia?.voiceId,
    });
    return {
      synthesizeForTelephony: (text: string) => cartesiaProvider.synthesizeForTelephony(text),
      synthesizeForTelephonyStreaming: (text: string) =>
        cartesiaProvider.synthesizeForTelephonyStreaming(text),
    };
  }

  // Other providers (OpenAI, ElevenLabs) need PCM-to-mulaw conversion
  const mergedConfig = applyTtsOverride(coreConfig, ttsOverride);

  return {
    synthesizeForTelephony: async (text: string) => {
      const result = await runtime.textToSpeechTelephony({
        text,
        cfg: mergedConfig,
      });

      if (!result.success || !result.audioBuffer || !result.sampleRate) {
        throw new Error(result.error ?? "TTS conversion failed");
      }

      return convertPcmToMulaw8k(result.audioBuffer, result.sampleRate);
    },
  };
}

function applyTtsOverride(coreConfig: CoreConfig, override?: VoiceCallTtsConfig): CoreConfig {
  if (!override) {
    return coreConfig;
  }

  const base = coreConfig.messages?.tts;
  const merged = mergeTtsConfig(base, override);
  if (!merged) {
    return coreConfig;
  }

  return {
    ...coreConfig,
    messages: {
      ...coreConfig.messages,
      tts: merged,
    },
  };
}

function mergeTtsConfig(
  base?: VoiceCallTtsConfig,
  override?: VoiceCallTtsConfig,
): VoiceCallTtsConfig | undefined {
  if (!base && !override) {
    return undefined;
  }
  if (!override) {
    return base;
  }
  if (!base) {
    return override;
  }
  return deepMerge(base, override);
}

function deepMerge<T>(base: T, override: T): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    const existing = (base as Record<string, unknown>)[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
