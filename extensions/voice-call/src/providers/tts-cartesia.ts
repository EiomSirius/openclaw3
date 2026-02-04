/**
 * Cartesia TTS Provider
 *
 * WebSocket-based TTS provider using Cartesia's Sonic-3 model.
 * Key advantage: Native mu-law 8kHz output - no audio conversion needed.
 *
 * Features:
 * - Persistent WebSocket connection (eliminates per-request connection overhead)
 * - Context continuity for natural prosody across turns
 * - ~90ms time-to-first-audio
 * - Direct mu-law 8kHz output for telephony
 *
 * @see https://docs.cartesia.ai/api-reference/tts/websocket
 */

import WebSocket from "ws";

const CARTESIA_WS_URL = "wss://api.cartesia.ai/tts/websocket";

/**
 * Cartesia TTS configuration.
 */
export interface CartesiaTTSConfig {
  /** Cartesia API key */
  apiKey: string;
  /** Model ID (default: sonic-3) */
  modelId?: string;
  /** Voice ID */
  voiceId: string;
}

/**
 * Cartesia TTS Provider with persistent WebSocket connection.
 *
 * Unlike OpenAI/ElevenLabs, Cartesia outputs mu-law 8kHz directly,
 * eliminating the need for PCM-to-mulaw conversion.
 *
 * The connection is kept open and reused across TTS requests for
 * minimal latency. Context ID is maintained for natural prosody.
 */
/**
 * Streaming request handler for real-time chunk forwarding.
 */
interface StreamingRequest {
  onChunk: (chunk: Buffer) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export class CartesiaTTSProvider {
  private apiKey: string;
  private modelId: string;
  private voiceId: string;
  private ws: WebSocket | null = null;
  private contextId: string;
  private connecting: Promise<void> | null = null;
  private pendingRequests = new Map<
    string,
    {
      chunks: Buffer[];
      resolve: (audio: Buffer) => void;
      reject: (error: Error) => void;
    }
  >();
  /** Streaming requests for real-time chunk forwarding */
  private streamingRequests = new Map<string, StreamingRequest>();

  constructor(config: CartesiaTTSConfig) {
    if (!config.apiKey) {
      throw new Error("Cartesia API key required (set apiKey or CARTESIA_API_KEY env)");
    }
    if (!config.voiceId) {
      throw new Error("Cartesia voice ID required");
    }
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || "sonic-3";
    this.voiceId = config.voiceId;
    // Single context ID for the session - maintains prosody across turns
    this.contextId = crypto.randomUUID();
  }

  /**
   * Ensure WebSocket is connected, reusing existing connection.
   */
  private async ensureConnected(): Promise<void> {
    // Already connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // Connection in progress - wait for it
    if (this.connecting) {
      return this.connecting;
    }

    // Start new connection
    this.connecting = this.connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /**
   * Establish WebSocket connection.
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${CARTESIA_WS_URL}?api_key=${this.apiKey}&cartesia_version=2024-06-10`;
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error("Cartesia connection timeout"));
      }, 10000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        console.log("[CartesiaTTS] Connected (persistent)");
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error) => {
        clearTimeout(timeout);
        console.error("[CartesiaTTS] WebSocket error:", error.message);
        // Reject pending requests
        for (const [, request] of this.pendingRequests) {
          request.reject(new Error(`Cartesia connection error: ${error.message}`));
        }
        this.pendingRequests.clear();
        // Notify streaming requests
        for (const [, request] of this.streamingRequests) {
          request.onError(new Error(`Cartesia connection error: ${error.message}`));
        }
        this.streamingRequests.clear();
        reject(new Error(`Cartesia connection failed: ${error.message}`));
      });

      this.ws.on("close", (code, reason) => {
        clearTimeout(timeout);
        console.log(`[CartesiaTTS] Connection closed: ${code}`);
        this.ws = null;
        // Reject pending requests
        for (const [, request] of this.pendingRequests) {
          request.reject(new Error(`Cartesia connection closed: ${code} ${reason.toString()}`));
        }
        this.pendingRequests.clear();
        // Notify streaming requests
        for (const [, request] of this.streamingRequests) {
          request.onError(new Error(`Cartesia connection closed: ${code} ${reason.toString()}`));
        }
        this.streamingRequests.clear();
      });
    });
  }

  /**
   * Handle incoming WebSocket message.
   * Routes to either buffered or streaming request handlers.
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as CartesiaResponse;
      const ctxId = message.context_id;

      if (!ctxId) {
        return;
      }

      // Check for streaming request first (real-time forwarding)
      const streamingRequest = this.streamingRequests.get(ctxId);
      if (streamingRequest) {
        if (message.type === "chunk" && message.data) {
          const audioChunk = Buffer.from(message.data, "base64");
          streamingRequest.onChunk(audioChunk);
        } else if (message.type === "done") {
          streamingRequest.onDone();
        } else if (message.type === "error") {
          const errorMsg = message.message || message.error || "Unknown Cartesia error";
          streamingRequest.onError(new Error(`Cartesia TTS error: ${errorMsg}`));
        }
        return;
      }

      // Fall back to buffered request handling
      const request = this.pendingRequests.get(ctxId);
      if (!request) {
        return;
      }

      if (message.type === "chunk" && message.data) {
        const audioChunk = Buffer.from(message.data, "base64");
        request.chunks.push(audioChunk);
      } else if (message.type === "done") {
        const fullAudio = Buffer.concat(request.chunks);
        console.log(`[CartesiaTTS] Synthesized ${fullAudio.length} bytes`);
        this.pendingRequests.delete(ctxId);
        request.resolve(fullAudio);
      } else if (message.type === "error") {
        const errorMsg = message.message || message.error || "Unknown Cartesia error";
        console.error("[CartesiaTTS] Error:", errorMsg);
        this.pendingRequests.delete(ctxId);
        request.reject(new Error(`Cartesia TTS error: ${errorMsg}`));
      }
    } catch {
      // Non-JSON message, ignore
    }
  }

  /**
   * Synthesize text to mu-law 8kHz audio for telephony.
   * Returns raw mu-law audio buffer ready for Twilio.
   */
  async synthesizeForTelephony(text: string): Promise<Buffer> {
    await this.ensureConnected();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cartesia WebSocket not connected");
    }

    return new Promise((resolve, reject) => {
      // Use session context for prosody continuity, but unique ID per request for tracking
      const requestId = `${this.contextId}-${Date.now()}`;

      this.pendingRequests.set(requestId, {
        chunks: [],
        resolve,
        reject,
      });

      // Timeout for this specific request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Cartesia TTS timeout"));
      }, 30000);

      // Wrap resolve/reject to clear timeout
      const originalResolve = resolve;
      const originalReject = reject;
      this.pendingRequests.set(requestId, {
        chunks: [],
        resolve: (audio) => {
          clearTimeout(timeout);
          originalResolve(audio);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      });

      const request = {
        model_id: this.modelId,
        transcript: text,
        voice: {
          mode: "id",
          id: this.voiceId,
        },
        output_format: {
          container: "raw",
          encoding: "pcm_mulaw",
          sample_rate: 8000,
        },
        context_id: requestId,
        // Continue from previous context for natural prosody
        continue: this.pendingRequests.size > 1,
      };

      this.ws.send(JSON.stringify(request));
    });
  }

  /**
   * Synthesize text to mu-law 8kHz audio for telephony with streaming.
   * Yields audio chunks as they arrive from Cartesia for immediate forwarding.
   * ~90ms time-to-first-audio instead of waiting for full synthesis.
   */
  async *synthesizeForTelephonyStreaming(text: string): AsyncGenerator<Buffer> {
    await this.ensureConnected();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cartesia WebSocket not connected");
    }

    const requestId = `${this.contextId}-${Date.now()}`;

    // Queue for incoming chunks and synchronization
    const chunkQueue: Buffer[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveWait: (() => void) | null = null;

    // Register streaming handler for this request
    this.streamingRequests.set(requestId, {
      onChunk: (chunk) => {
        chunkQueue.push(chunk);
        resolveWait?.();
      },
      onDone: () => {
        done = true;
        resolveWait?.();
      },
      onError: (err) => {
        error = err;
        resolveWait?.();
      },
    });

    // Timeout for this specific request
    const timeout = setTimeout(() => {
      error = new Error("Cartesia TTS streaming timeout");
      resolveWait?.();
    }, 30000);

    // Send request to Cartesia
    const request = {
      model_id: this.modelId,
      transcript: text,
      voice: {
        mode: "id",
        id: this.voiceId,
      },
      output_format: {
        container: "raw",
        encoding: "pcm_mulaw",
        sample_rate: 8000,
      },
      context_id: requestId,
      continue: this.streamingRequests.size > 1 || this.pendingRequests.size > 0,
    };

    this.ws.send(JSON.stringify(request));

    // Yield chunks as they arrive
    try {
      while (!done && !error) {
        if (chunkQueue.length > 0) {
          yield chunkQueue.shift()!;
        } else {
          // Wait for next chunk, done, or error
          await new Promise<void>((r) => {
            resolveWait = r;
          });
        }
      }
      // Yield any remaining chunks
      while (chunkQueue.length > 0) {
        yield chunkQueue.shift()!;
      }
      if (error) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      this.streamingRequests.delete(requestId);
    }
  }

  /**
   * Close the persistent connection.
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
    this.streamingRequests.clear();
  }
}

/**
 * Cartesia WebSocket response message types.
 */
interface CartesiaResponse {
  type: "chunk" | "done" | "error" | "timestamps";
  /** Base64-encoded audio data (for chunk type) */
  data?: string;
  /** Error message (for error type) */
  message?: string;
  error?: string;
  /** Context ID */
  context_id?: string;
}

/**
 * Create a Cartesia TTS provider instance.
 */
export function createCartesiaTtsProvider(config: {
  apiKey?: string;
  modelId?: string;
  voiceId?: string;
}): CartesiaTTSProvider {
  const apiKey = config.apiKey || process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error("Cartesia API key required (set cartesia.apiKey or CARTESIA_API_KEY env)");
  }
  if (!config.voiceId) {
    throw new Error("Cartesia voice ID required (set cartesia.voiceId)");
  }

  return new CartesiaTTSProvider({
    apiKey,
    modelId: config.modelId,
    voiceId: config.voiceId,
  });
}
