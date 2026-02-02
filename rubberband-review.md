# RubberBand Code Review

**Scope**
- Focused on `src/security/rubberband.ts` and its integration in `src/agents/bash-tools.exec.ts`.

**Summary**
- Solid baseline for static command analysis, but there are a few integration gaps that will lead to weaker enforcement than intended.
- The biggest issue is that `ALERT` dispositions do not actually require approval in gateway/node flows, which contradicts the config docs and makes `mode: "alert"` less useful.

**Findings**
1. **High — ALERT does not trigger approvals (gateway + node).**
- In both gateway and node paths, `rbRequiresApproval` is initialized but never set, so `requiresAsk` ignores RubberBand alerts. This contradicts the config docs that describe `alert` as “require approval.”
- Evidence: `src/agents/bash-tools.exec.ts:1013-1127` and `src/agents/bash-tools.exec.ts:1318-1365`.
- Suggestion: set `rbRequiresApproval = rbResult.disposition === "ALERT"` (and likely only when `rbResult.matches.length > 0`) so it influences `requiresAsk`.

2. **Medium — `mode: "log"` and `mode: "shadow"` still yield `ALERT` dispositions.**
- `analyzeCommand` only treats `mode: "block"` specially. For `log` and `shadow`, a high score still returns `ALERT`, which the exec tool treats as warnings/notifications. That conflicts with the config docs that say `log` is silent and `shadow` is log-only (no block). 
- Evidence: `src/security/rubberband.ts:725-757` and the alert handling in `src/agents/bash-tools.exec.ts:1031-1039` / `1336-1344`.
- Suggestion: incorporate `config.mode` into disposition mapping. For example:
  - `mode: "log"` → always `LOG` for `risk.score > 0`.
  - `mode: "shadow"` → return `LOG` but keep the internal log line (or add a distinct “shadow” log path) to avoid user-visible warnings.

3. **Medium — Default thresholds are inconsistent across config/docs/implementation.**
- `DEFAULT_CONFIG` uses block threshold `80`, config docs say `60`, and exec tool defaults to `60` when thresholds are specified. This creates different behavior depending on whether thresholds are explicitly provided.
- Evidence: `src/security/rubberband.ts:41-47`, `src/agents/bash-tools.exec.ts:823-830`, `src/config/schema.ts:432-439`.
- Suggestion: align all defaults to a single value (either 60 or 80) and update docs or code accordingly.

4. **Low — No tests for pattern detection or approval integration.**
- There are no tests covering the new detection rules, threshold behavior, or approval gating.
- Suggestion: add unit tests for `analyzeCommand` (mode handling + thresholds) and integration tests around exec approval flow (ALERT requires approval, BLOCK rejects).

**Recommended Next Steps**
1. Decide intended behavior for `mode: "log"` and `mode: "shadow"`, then update `analyzeCommand` and/or exec alert handling to match.
2. Wire RubberBand alerts into the approval flow (`rbRequiresApproval`).
3. Align defaults and update docs.
4. Add tests to lock the behavior in.
