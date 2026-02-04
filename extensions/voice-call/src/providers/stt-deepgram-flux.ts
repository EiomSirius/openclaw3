/**
 * Deepgram Flux STT Provider
 *
 * Uses the official Deepgram SDK with the Flux model for streaming transcription:
 * - Model-integrated end-of-turn detection (not just silence/VAD)
 * - Direct mu-law audio support (8kHz telephony format)
 * - Low-latency streaming for voice agents
 * - Turn events: EndOfTurn, EagerEndOfTurn, TurnResumed, UserStartedSpeaking
 */

import type { LiveClient, ListenLiveOptions } from "@deepgram/sdk";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import WebSocket from "ws";

/**
 * Configuration for Deepgram Flux STT.
 *
 * Flux end-of-turn configuration (from Deepgram docs):
 * - eot_threshold: 0.5-0.9 (default: 0.7) - confidence for EndOfTurn
 * - eager_eot_threshold: 0.3-0.9 (default: 0.4) - confidence for EagerEndOfTurn
 * - eot_timeout_ms: 500-10000 (default: 6000) - silence timeout fallback
 *
 * eager_eot_threshold must be ≤ eot_threshold for valid configuration.
 */
export interface DeepgramFluxSTTConfig {
  /** Deepgram API key */
  apiKey: string;
  /** Model to use (default: flux-general-en) */
  model?: string;
  /** End-of-turn confidence threshold 0.5-0.9 (default: 0.7) */
  eotThreshold?: number;
  /** Eager end-of-turn threshold 0.3-0.9 for speculative processing (default: 0.4) */
  eagerEotThreshold?: number;
  /** End-of-turn timeout in ms 500-10000 (default: 6000) */
  eotTimeoutMs?: number;
}

/**
 * Session for streaming audio and receiving transcripts.
 */
export interface DeepgramFluxSTTSession {
  /** Connect to the transcription service */
  connect(): Promise<void>;
  /** Send mu-law audio data (8kHz mono) */
  sendAudio(audio: Buffer): void;
  /** Wait for next complete transcript (after end-of-turn) */
  waitForTranscript(timeoutMs?: number): Promise<string>;
  /** Set callback for partial transcripts (streaming) */
  onPartial(callback: (partial: string) => void): void;
  /** Set callback for final transcripts */
  onTranscript(callback: (transcript: string) => void): void;
  /** Set callback when speech starts (barge-in detection) */
  onSpeechStart(callback: () => void): void;
  /** Set callback for eager end-of-turn (speculative processing) */
  onEagerEndOfTurn(callback: (transcript: string) => void): void;
  /** Set callback when turn resumes after eager end-of-turn */
  onTurnResumed(callback: (newTranscript: string) => void): void;
  /** Close the session */
  close(): void;
  /** Check if session is connected */
  isConnected(): boolean;
}

/**
 * Provider factory for Deepgram Flux STT sessions.
 */
export class DeepgramFluxSTTProvider {
  readonly name = "deepgram-flux";
  private apiKey: string;
  private model: string;
  private eotThreshold: number;
  private eagerEotThreshold: number;
  private eotTimeoutMs: number;

  constructor(config: DeepgramFluxSTTConfig) {
    if (!config.apiKey) {
      throw new Error("Deepgram API key required for Flux STT");
    }
    this.apiKey = config.apiKey;
    this.model = config.model || "flux-general-en";
    // Deepgram recommended values for low-latency voice agents
    this.eotThreshold = config.eotThreshold ?? 0.7;
    this.eagerEotThreshold = config.eagerEotThreshold ?? 0.4;
    this.eotTimeoutMs = config.eotTimeoutMs ?? 6000;
  }

  /**
   * Create a new Flux transcription session.
   */
  createSession(): DeepgramFluxSTTSession {
    return new DeepgramFluxSTTSessionImpl(
      this.apiKey,
      this.model,
      this.eotThreshold,
      this.eagerEotThreshold,
      this.eotTimeoutMs,
    );
  }
}

/**
 * SDK-based session for Deepgram Flux speech-to-text.
 */
class DeepgramFluxSTTSessionImpl implements DeepgramFluxSTTSession {
  private connection: LiveClient | null = null;
  private connected = false;
  private closed = false;
  private pendingTranscript = "";
  private onTranscriptCallback: ((transcript: string) => void) | null = null;
  private onPartialCallback: ((partial: string) => void) | null = null;
  private onSpeechStartCallback: (() => void) | null = null;
  private onEagerEndOfTurnCallback: ((transcript: string) => void) | null = null;
  private onTurnResumedCallback: ((transcript: string) => void) | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly eotThreshold: number,
    private readonly eagerEotThreshold: number,
    private readonly eotTimeoutMs: number,
  ) {}

  async connect(): Promise<void> {
    this.closed = false;

    // WORKAROUND: Node.js 25+ has native WebSocket, but Deepgram's v2 endpoint doesn't
    // support the subprotocol-based auth that the SDK uses with native WebSocket.
    // Pass the 'ws' library explicitly which uses header-based auth.
    const deepgram = createClient(this.apiKey, {
      global: {
        websocket: {
          client: WebSocket as unknown as typeof globalThis.WebSocket,
        },
      },
    });

    // Build options for Flux streaming
    // Flux v2 endpoint only accepts: model, encoding, sample_rate, and EOT params
    // (channels and interim_results are NOT supported on v2)
    const options: ListenLiveOptions = {
      model: this.model,
      encoding: "mulaw",
      sample_rate: 8000,
      // Flux end-of-turn configuration (snake_case for API)
      // @ts-expect-error - Flux options not yet in SDK types
      eot_threshold: this.eotThreshold,
      // @ts-expect-error - Flux options not yet in SDK types
      eot_timeout_ms: this.eotTimeoutMs,
    };

    // Only add eager_eot_threshold if valid (must be <= eot_threshold)
    if (this.eagerEotThreshold > 0 && this.eagerEotThreshold <= this.eotThreshold) {
      // @ts-expect-error - Flux options not yet in SDK types
      options.eager_eot_threshold = this.eagerEotThreshold;
    }

    return new Promise((resolve, reject) => {
      // Flux requires v2 endpoint for turn events
      // Pass "v2/listen" as the endpoint (default is ":version/listen" which becomes v1)
      this.connection = deepgram.listen.live(options, "v2/listen");

      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("[DeepgramFlux] Connected via SDK");
        this.connected = true;
        resolve();
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error) => {
        // Extract readable error info from Deepgram error
        const dgError = error as {
          message?: string;
          statusCode?: number;
          requestId?: string;
          url?: string;
          responseHeaders?: Record<string, string>;
        };
        const dgErrorHeader = dgError.responseHeaders?.["dg-error"];

        console.error("[DeepgramFlux] Connection error:", {
          message: dgError.message || String(error),
          statusCode: dgError.statusCode,
          dgError: dgErrorHeader,
          requestId: dgError.requestId,
          url: dgError.url,
        });

        if (!this.connected) {
          reject(new Error(dgErrorHeader || dgError.message || "Deepgram connection failed"));
        }
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("[DeepgramFlux] Connection closed");
        this.connected = false;
      });

      // Handle transcript events (v1 style - fallback)
      this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        this.handleTranscript(data);
      });

      // Handle speech started (for barge-in)
      this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
        console.log("[DeepgramFlux] SpeechStarted");
        this.onSpeechStartCallback?.();
      });

      // Handle utterance end (fallback end-of-turn)
      this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        console.log("[DeepgramFlux] UtteranceEnd");
        if (this.pendingTranscript) {
          this.onTranscriptCallback?.(this.pendingTranscript);
          this.pendingTranscript = "";
        }
      });

      // Handle metadata (ignore)
      this.connection.on(LiveTranscriptionEvents.Metadata, () => {});

      // Handle unhandled events (Flux turn events come through here)
      this.connection.on(LiveTranscriptionEvents.Unhandled, (data) => {
        this.handleTranscript(data);
      });

      // Timeout for connection
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error("Deepgram Flux connection timeout"));
        }
      }, 10000);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleTranscript(data: any): void {
    // Flux turn events come through as special message types
    // Check for Flux-specific events first
    if (data.event) {
      switch (data.event) {
        case "StartOfTurn":
          console.log(`[DeepgramFlux] StartOfTurn: "${data.transcript}"`);
          this.pendingTranscript = data.transcript || "";
          this.onSpeechStartCallback?.();
          if (data.transcript) {
            this.onPartialCallback?.(data.transcript);
          }
          return;

        case "Update":
          if (data.transcript) {
            this.pendingTranscript = data.transcript;
            this.onPartialCallback?.(data.transcript);
          }
          return;

        case "EagerEndOfTurn":
          console.log(
            `[DeepgramFlux] EagerEndOfTurn (confidence: ${data.end_of_turn_confidence}): "${data.transcript}"`,
          );
          if (data.transcript) {
            this.pendingTranscript = data.transcript;
            this.onEagerEndOfTurnCallback?.(data.transcript);
            this.onPartialCallback?.(data.transcript);
          }
          return;

        case "TurnResumed":
          console.log(`[DeepgramFlux] TurnResumed: "${data.transcript}"`);
          if (data.transcript) {
            this.pendingTranscript = data.transcript;
            this.onTurnResumedCallback?.(data.transcript);
            this.onPartialCallback?.(data.transcript);
          }
          return;

        case "EndOfTurn":
          const transcript = data.transcript?.trim() || "";
          console.log(
            `[DeepgramFlux] EndOfTurn (confidence: ${data.end_of_turn_confidence}): "${transcript}"`,
          );
          if (transcript) {
            this.onTranscriptCallback?.(transcript);
          }
          this.pendingTranscript = "";
          return;
      }
    }

    // Standard Deepgram transcript format (fallback for non-Flux or legacy)
    const alt = data.channel?.alternatives?.[0];
    if (alt?.transcript) {
      if (data.is_final) {
        this.pendingTranscript = alt.transcript;
        if (data.speech_final) {
          console.log(`[DeepgramFlux] Final: "${alt.transcript}"`);
          this.onTranscriptCallback?.(alt.transcript);
          this.pendingTranscript = "";
        }
      } else {
        this.pendingTranscript = alt.transcript;
        this.onPartialCallback?.(alt.transcript);
      }
    }
  }

  private audioBytesSent = 0;

  sendAudio(muLawData: Buffer): void {
    if (!this.connected || !this.connection) {
      return;
    }
    this.connection.send(muLawData);
    this.audioBytesSent += muLawData.length;
  }

  onPartial(callback: (partial: string) => void): void {
    this.onPartialCallback = callback;
  }

  onTranscript(callback: (transcript: string) => void): void {
    this.onTranscriptCallback = callback;
  }

  onSpeechStart(callback: () => void): void {
    this.onSpeechStartCallback = callback;
  }

  onEagerEndOfTurn(callback: (transcript: string) => void): void {
    this.onEagerEndOfTurnCallback = callback;
  }

  onTurnResumed(callback: (transcript: string) => void): void {
    this.onTurnResumedCallback = callback;
  }

  async waitForTranscript(timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.onTranscriptCallback = null;
        reject(new Error("Transcript timeout"));
      }, timeoutMs);

      this.onTranscriptCallback = (transcript) => {
        clearTimeout(timeout);
        this.onTranscriptCallback = null;
        resolve(transcript);
      };
    });
  }

  close(): void {
    this.closed = true;
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
