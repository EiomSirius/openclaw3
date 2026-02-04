/**
 * Gateway RPC methods for model request events
 *
 * Provides methods for the Control UI to subscribe to and query model request events.
 */

import type { GatewayRequestHandlers, GatewayMethodHandler } from "./types.js";
import {
  getRecentModelRequests,
  clearRecentModelRequests,
} from "../../infra/model-request-events.js";

/**
 * model-requests.list - Get recent model requests
 */
const modelRequestsListHandler: GatewayMethodHandler = async ({ respond }) => {
  const requests = getRecentModelRequests();
  respond(true, {
    requests,
    count: requests.length,
  });
};

/**
 * model-requests.clear - Clear recent model requests history
 */
const modelRequestsClearHandler: GatewayMethodHandler = async ({ respond }) => {
  clearRecentModelRequests();
  respond(true, { ok: true });
};

export const modelRequestsHandlers: GatewayRequestHandlers = {
  "model-requests.list": modelRequestsListHandler,
  "model-requests.clear": modelRequestsClearHandler,
};
