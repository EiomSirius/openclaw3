# Feature Request: Model Requests Panel for Control UI

## Summary

Add a real-time "Model Requests" panel to the Control UI that displays all model API calls with their success/failure status, timing, token usage, and error details. This enables users to:

1. **See every API call** - Both successful and failed requests are visible
2. **Understand failures** - HTTP error codes, timeout info, rate limiting, etc.
3. **Monitor in real-time** - Live updates via WebSocket events
4. **Debug issues** - Correlate failures with specific sessions and models

## Problem

Currently, when a model API call fails, users have no visibility into:
- What went wrong (timeout, rate limit, API error, etc.)
- Which model/provider failed
- How long the request took before failing
- Whether the request was retried

Users must dig through log files to find this information, which is time-consuming and not user-friendly.

## Solution

### New Tab: "Requests"

Add a new tab in the Control UI Settings section called "Requests" that shows:

```
┌─────────────────────────────────────────────────────────────┐
│ Model Requests                          ⏳ 0  ✅ 5  ❌ 2    │
├─────────────────────────────────────────────────────────────┤
│ ✅ 10:54:03 | poe/claude-opus-4.5 | 2.3s | 1.2k→850 tokens │
│ ❌ 10:53:45 | minimax/M2.1 | TIMEOUT | 30s                  │
│    └─ Error: Request timeout after 30000ms                  │
│ ✅ 10:53:12 | poe/gemini-3-flash | 0.8s | 500→320 tokens   │
│ ❌ 10:52:58 | poe/claude-opus-4.5 | 429 Rate Limited        │
│    └─ Retry-After: 60s | Fallback → gemini-3-flash         │
└─────────────────────────────────────────────────────────────┘
```

### Information Displayed

For each request:
- **Status**: ⏳ pending, ✅ success, ❌ error
- **Timestamp**: When the request started
- **Model**: provider/model identifier
- **Duration**: Time taken (or timeout duration for errors)
- **Token Usage**: Input→Output tokens (with cache info)
- **Cost**: Estimated cost in USD
- **Error Details** (for failures):
  - HTTP status code
  - Error message
  - Whether it's retryable
  - Retry attempt number

### Implementation Details

#### Backend Changes

1. **New Event System** (`src/infra/model-request-events.ts`)
   - `ModelRequestEvent` type with status, timing, usage, error info
   - `emitModelRequestEvent()` to emit events
   - `onModelRequestEvent()` for subscribers
   - `getRecentModelRequests()` to retrieve recent requests
   - `createModelRequestTracker()` helper for tracking request lifecycle

2. **Gateway RPC Methods** (`src/gateway/server-methods/model-requests.ts`)
   - `model-requests.list` - Get recent model requests
   - `model-requests.clear` - Clear request history

3. **WebSocket Event Broadcasting**
   - New `model.request` event broadcast to Control UI clients
   - Events include: request start, success, and error states

4. **Integration with Agent Runner**
   - Track request lifecycle in `agent-runner.ts`
   - Emit events at start, success, and error points

#### Frontend Changes

1. **New View** (`ui/src/ui/views/requests.ts`)
   - `renderRequests()` component
   - Real-time display with auto-refresh option
   - Clear history button
   - Filter/search capabilities (future enhancement)

2. **Navigation** (`ui/src/ui/navigation.ts`)
   - Add "requests" tab to Settings group
   - Icon, title, and subtitle

3. **App State** (`ui/src/ui/app.ts`, `ui/src/ui/app-view-state.ts`)
   - `requestsLoading`, `requestsError`, `requestsEntries`, `requestsAutoRefresh`
   - Handler methods for load, clear, toggle auto-refresh

4. **Gateway Event Handling** (`ui/src/ui/app-gateway.ts`)
   - Handle `model.request` events
   - Update UI state in real-time

## Files Changed

### New Files
- `src/infra/model-request-events.ts` - Event system
- `src/gateway/server-methods/model-requests.ts` - RPC handlers
- `ui/src/ui/views/requests.ts` - UI component
- `ui/src/ui/controllers/requests.ts` - State controller

### Modified Files
- `src/gateway/server-methods.ts` - Register new handlers
- `src/gateway/server.impl.ts` - Enable events, setup broadcasting
- `src/auto-reply/reply/agent-runner.ts` - Emit request events
- `ui/src/ui/navigation.ts` - Add new tab
- `ui/src/ui/app.ts` - Add state and handlers
- `ui/src/ui/app-view-state.ts` - Add types
- `ui/src/ui/app-render.ts` - Render new view
- `ui/src/ui/app-gateway.ts` - Handle events

## User Experience

1. User navigates to Settings → Requests
2. Sees live feed of all model API calls
3. Can identify failed requests immediately by the ❌ icon
4. Clicks on a failed request to see full error details
5. Can clear history or toggle auto-refresh
6. Can correlate issues with specific sessions

## Future Enhancements

- Filter by status (show only errors)
- Filter by model/provider
- Search by session key
- Export requests to JSON
- Configurable retention period
- Aggregate statistics (success rate, avg latency)

## Testing

- Unit tests for `model-request-events.ts`
- Integration tests for RPC methods
- E2E tests for UI component
- Manual testing with various error scenarios

## Migration

No migration required. Feature is additive and backward-compatible.

---

**Author**: OpenClaw Fork (wanghaoyi)
**Date**: 2026-02-04
