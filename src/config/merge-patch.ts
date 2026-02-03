type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyMergePatch(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) {
    return patch;
  }

  const result: PlainObject = isPlainObject(base) ? { ...base } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
      continue;
    }
    if (isPlainObject(value)) {
      const baseValue = result[key];
      result[key] = applyMergePatch(isPlainObject(baseValue) ? baseValue : {}, value);
      continue;
    }
    result[key] = value;
  }

  return result;
}

/**
 * Gateway transport fields that are inherently host-specific and must not be
 * overwritten by config.patch (e.g. from a paired device syncing its own
 * gateway settings). These should only be changed via config.set or the CLI.
 *
 * The stripping performed by {@link stripProtectedGatewayPaths} is intentionally
 * shallow: it only removes direct `patch.gateway.<key>` entries. This is safe
 * because config patches follow RFC 7396 (JSON Merge Patch) semantics, which
 * represent changes as structured, nested objects -- not as dotted-key paths or
 * JSON Pointer strings. The protocol never produces a top-level key like
 * `"gateway.mode"`; the key `mode` always appears nested inside a `gateway`
 * object.
 */
const PROTECTED_GATEWAY_KEYS = new Set(["mode", "remote", "bind", "port"]);

/**
 * Strips host-local gateway transport fields from a config patch object.
 * Returns the cleaned patch and a list of paths that were stripped.
 */
export function stripProtectedGatewayPaths(patch: unknown): {
  cleaned: unknown;
  stripped: string[];
} {
  if (!isPlainObject(patch)) {
    return { cleaned: patch, stripped: [] };
  }

  const gateway = patch.gateway;
  if (!isPlainObject(gateway)) {
    return { cleaned: patch, stripped: [] };
  }

  const stripped: string[] = [];
  const filteredGateway: PlainObject = {};

  for (const [key, value] of Object.entries(gateway)) {
    if (PROTECTED_GATEWAY_KEYS.has(key)) {
      stripped.push(`gateway.${key}`);
    } else {
      filteredGateway[key] = value;
    }
  }

  if (stripped.length === 0) {
    return { cleaned: patch, stripped: [] };
  }

  const result = { ...patch };
  if (Object.keys(filteredGateway).length === 0) {
    delete result.gateway;
  } else {
    result.gateway = filteredGateway;
  }

  return { cleaned: result, stripped };
}
