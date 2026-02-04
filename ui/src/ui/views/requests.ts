/**
 * Model Requests View - Real-time API call monitoring
 *
 * Displays a live feed of model API requests with status, timing, and error details.
 */

import { html, nothing } from "lit";

export type ModelRequestEntry = {
  id: string;
  ts: number;
  status: "pending" | "success" | "error";
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  provider?: string;
  model?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  context?: {
    limit?: number;
    used?: number;
  };
  costUsd?: number;
  error?: {
    code?: string;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
  };
  attempt?: number;
  maxAttempts?: number;
  requestType?: string;
};

export type RequestsProps = {
  loading: boolean;
  requests: ModelRequestEntry[];
  error: string | null;
  autoRefresh: boolean;
  onRefresh: () => void;
  onClear: () => void;
  onToggleAutoRefresh: () => void;
};

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) {
    return "-";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(usage: ModelRequestEntry["usage"]): string {
  if (!usage) {
    return "-";
  }
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const cache = (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  if (cache > 0) {
    return `${input}→${output} (+${cache} cache)`;
  }
  return `${input}→${output}`;
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined || cost === 0) {
    return "-";
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(3)}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatModel(provider?: string, model?: string): string {
  if (!provider && !model) {
    return "unknown";
  }
  if (provider && model) {
    return `${provider}/${model}`;
  }
  return model ?? provider ?? "unknown";
}

function getStatusIcon(status: ModelRequestEntry["status"]): string {
  switch (status) {
    case "pending":
      return "⏳";
    case "success":
      return "✅";
    case "error":
      return "❌";
    default:
      return "❓";
  }
}

function getStatusClass(status: ModelRequestEntry["status"]): string {
  switch (status) {
    case "pending":
      return "status-pending";
    case "success":
      return "status-success";
    case "error":
      return "status-error";
    default:
      return "";
  }
}

function renderRequestRow(req: ModelRequestEntry) {
  const statusIcon = getStatusIcon(req.status);
  const statusClass = getStatusClass(req.status);
  const modelStr = formatModel(req.provider, req.model);
  const durationStr = formatDuration(req.durationMs);
  const tokensStr = formatTokens(req.usage);
  const costStr = formatCost(req.costUsd);
  const timeStr = formatTime(req.startedAt);

  return html`
    <div class="request-row ${statusClass}">
      <div class="request-status">${statusIcon}</div>
      <div class="request-time">${timeStr}</div>
      <div class="request-model" title="${modelStr}">${modelStr}</div>
      <div class="request-duration">${durationStr}</div>
      <div class="request-tokens">${tokensStr}</div>
      <div class="request-cost">${costStr}</div>
      ${req.error
        ? html`
            <div class="request-error">
              <span class="error-code">${req.error.httpStatus ?? req.error.code ?? "ERR"}</span>
              <span class="error-message" title="${req.error.message}">${req.error.message}</span>
              ${req.error.retryable ? html`<span class="retry-badge">Retryable</span>` : nothing}
            </div>
          `
        : nothing}
      ${req.attempt && req.attempt > 1
        ? html`<div class="request-attempt">Attempt ${req.attempt}/${req.maxAttempts ?? "?"}</div>`
        : nothing}
      ${req.sessionKey
        ? html`<div class="request-session" title="${req.sessionKey}">${req.sessionKey}</div>`
        : nothing}
    </div>
  `;
}

export function renderRequests(props: RequestsProps) {
  const pendingCount = props.requests.filter((r) => r.status === "pending").length;
  const successCount = props.requests.filter((r) => r.status === "success").length;
  const errorCount = props.requests.filter((r) => r.status === "error").length;

  return html`
    <style>
      .requests-container {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .requests-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-color, #333);
        flex-shrink: 0;
      }
      .requests-title {
        font-size: 18px;
        font-weight: 600;
      }
      .requests-stats {
        display: flex;
        gap: 16px;
        font-size: 14px;
      }
      .stat-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .stat-pending { color: #f59e0b; }
      .stat-success { color: #10b981; }
      .stat-error { color: #ef4444; }
      .requests-actions {
        display: flex;
        gap: 8px;
      }
      .requests-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      .request-row {
        display: grid;
        grid-template-columns: 32px 80px 1fr 80px 140px 70px;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        margin-bottom: 4px;
        font-size: 13px;
        align-items: center;
        background: var(--bg-secondary, #1a1a1a);
      }
      .request-row:hover {
        background: var(--bg-hover, #252525);
      }
      .request-row.status-pending {
        border-left: 3px solid #f59e0b;
      }
      .request-row.status-success {
        border-left: 3px solid #10b981;
      }
      .request-row.status-error {
        border-left: 3px solid #ef4444;
      }
      .request-status {
        text-align: center;
      }
      .request-time {
        color: var(--text-muted, #888);
        font-family: monospace;
      }
      .request-model {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .request-duration {
        font-family: monospace;
        text-align: right;
      }
      .request-tokens {
        font-family: monospace;
        color: var(--text-muted, #888);
      }
      .request-cost {
        font-family: monospace;
        text-align: right;
        color: var(--text-muted, #888);
      }
      .request-error {
        grid-column: 1 / -1;
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 6px 8px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 4px;
        margin-top: 4px;
      }
      .error-code {
        font-weight: 600;
        color: #ef4444;
        font-family: monospace;
      }
      .error-message {
        flex: 1;
        color: #fca5a5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .retry-badge {
        font-size: 11px;
        padding: 2px 6px;
        background: #f59e0b;
        color: #000;
        border-radius: 3px;
        font-weight: 500;
      }
      .request-attempt {
        grid-column: 1 / -1;
        font-size: 12px;
        color: #f59e0b;
      }
      .request-session {
        grid-column: 1 / -1;
        font-size: 11px;
        color: var(--text-muted, #666);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .requests-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--text-muted, #888);
      }
      .requests-empty-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }
      .auto-refresh-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        cursor: pointer;
      }
      .auto-refresh-toggle input {
        cursor: pointer;
      }
    </style>

    <div class="requests-container">
      <div class="requests-header">
        <div>
          <div class="requests-title">Model Requests</div>
          <div class="requests-stats">
            <span class="stat-item stat-pending">⏳ ${pendingCount} pending</span>
            <span class="stat-item stat-success">✅ ${successCount} success</span>
            <span class="stat-item stat-error">❌ ${errorCount} errors</span>
          </div>
        </div>
        <div class="requests-actions">
          <label class="auto-refresh-toggle">
            <input
              type="checkbox"
              ?checked=${props.autoRefresh}
              @change=${props.onToggleAutoRefresh}
            />
            Auto-refresh
          </label>
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading..." : "Refresh"}
          </button>
          <button class="btn" @click=${props.onClear}>Clear</button>
        </div>
      </div>

      ${props.error
        ? html`<div class="callout danger" style="margin: 12px;">${props.error}</div>`
        : nothing}

      <div class="requests-list">
        ${props.requests.length === 0
          ? html`
              <div class="requests-empty">
                <div class="requests-empty-icon">📡</div>
                <div>No model requests yet</div>
                <div style="font-size: 13px; margin-top: 8px;">
                  API calls will appear here in real-time
                </div>
              </div>
            `
          : props.requests.map((req) => renderRequestRow(req))}
      </div>
    </div>
  `;
}
