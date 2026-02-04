/**
 * Model Requests Controller
 *
 * Handles loading and managing model request data from the gateway.
 */

import type { ModelRequestEntry } from "../views/requests.ts";

export type RequestsState = {
  requestsLoading: boolean;
  requestsError: string | null;
  requestsEntries: ModelRequestEntry[];
  requestsAutoRefresh: boolean;
  client: {
    request: <T>(method: string, params?: unknown) => Promise<T>;
  } | null;
};

export async function loadRequests(state: RequestsState): Promise<void> {
  if (!state.client) {
    state.requestsError = "Not connected to gateway";
    return;
  }

  state.requestsLoading = true;
  state.requestsError = null;

  try {
    const result = await state.client.request<{
      requests: ModelRequestEntry[];
      count: number;
    }>("model-requests.list");
    state.requestsEntries = result.requests ?? [];
  } catch (err) {
    state.requestsError = `Failed to load requests: ${String(err)}`;
  } finally {
    state.requestsLoading = false;
  }
}

export async function clearRequests(state: RequestsState): Promise<void> {
  if (!state.client) {
    state.requestsError = "Not connected to gateway";
    return;
  }

  try {
    await state.client.request("model-requests.clear");
    state.requestsEntries = [];
  } catch (err) {
    state.requestsError = `Failed to clear requests: ${String(err)}`;
  }
}

export function handleModelRequestEvent(
  state: RequestsState,
  event: ModelRequestEntry
): void {
  // Update or add the request entry
  const existingIndex = state.requestsEntries.findIndex((r) => r.id === event.id);
  if (existingIndex >= 0) {
    // Update existing entry
    const updated = [...state.requestsEntries];
    updated[existingIndex] = event;
    state.requestsEntries = updated;
  } else {
    // Add new entry at the beginning
    state.requestsEntries = [event, ...state.requestsEntries].slice(0, 100);
  }
}
