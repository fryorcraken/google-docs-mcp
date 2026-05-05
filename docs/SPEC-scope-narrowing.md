# Spec: Scope narrowing for least-privilege auth

**Status:** APPROVED 2026-05-06 — Option A locked, B/C deferred.
**PR in flight:** #12 (env-var-only approach)
**Author:** Claude (drafted from dogfood feedback + design discussion 2026-05-06)

## Objective

A user installing `@fryorcraken/google-docs-mcp` should be able to grant **only the OAuth scopes they actually need** without giving up server functionality for the domains they DO want. The current design forces a 7-scope grant or nothing — non-starter for privacy-conscious users.

Two related sub-goals:

1. **Reduce the OAuth scopes requested** at auth time (less data the server can access).
2. **Reduce the tools registered** at server start (so an LLM agent can't accidentally call a tool for a domain the user didn't grant).

Done when:

- A user can run `auth` and grant scopes for `docs` only, the flow succeeds, and only docs tools appear in `tools/list`.
- The default behavior (no extra config) requests all 7 scopes — backward compatible with v0.1.x users.
- Misconfiguration (e.g., requesting a scope for an API not enabled in the Cloud project) fails with a **clear, actionable** error.

## Tech stack

Same as the rest of the repo (TypeScript, FastMCP, googleapis). No new dependencies.

## The design space

Three approaches were proposed in dogfood feedback:

### Option A — `GOOGLE_MCP_SCOPES` env var (PR #12, currently open)

User sets `GOOGLE_MCP_SCOPES=docs,drive`. Server requests only those scopes AND registers only those tools.

**Pros:**

- Explicit user intent (matches least-privilege semantics).
- Works on first auth (no chicken-and-egg).
- Deterministic, reproducible across restarts.
- Cheap: one registry + one env var read.
- Already implemented + 18 tests in PR #12.

**Cons:**

- User has to know the env var exists. Discovery is via the skill or README.
- Setup-skill mismatch: skill walks user through enabling 7 APIs in Cloud Console; if they only want 2, they have to read the "Limited scopes" section to know they don't have to enable the others.
- Two state sources (project APIs enabled + env var) can drift.

### Option B — Auto-detect enabled APIs at auth time

Server probes which APIs are enabled in the Cloud project, requests scopes only for those, registers only those tools.

**Pros:**

- Zero configuration. Setup skill becomes "enable the APIs you want" → done.
- Single source of truth (the project's enabled APIs).
- Matches user mental model: "I enabled Docs and Drive, why does this server want Gmail?"

**Cons:**

- **Bootstrap problem.** Detecting enabled APIs requires _some_ auth. Three sub-options:
  - **B1** — Use Service Usage API (`serviceusage.services.list`). Needs `cloud-platform` scope, which the user must grant _before_ we can detect anything. Adds a meta-scope that's broader than what we save → worse than the original problem.
  - **B2** — Probe each API with a cheap call (e.g., `documents.get` on a fake ID). Read the error code: `accessNotConfigured` = API disabled, anything else = enabled. Needs a token first → only works on second-and-later runs, not first auth.
  - **B3** — On first auth, request the union of all 7 scopes; on each subsequent server start, probe and narrow tool registration. The token already covers all 7, so OAuth-time narrowing isn't possible — only tool-registration narrowing is.
- 7 extra API calls on every startup (B2/B3) — adds latency and a flaky-503 failure mode.
- **Project state ≠ user intent.** A user with all 7 APIs enabled in their project (because other tools use them) might still want this MCP server scoped to 2. Auto-detect over-requests in that case.
- Doesn't solve "only register the tools I want" — if the API is enabled, all tools register.

### Option C — Hybrid: env var as ceiling, auto-detect as floor

Env var (default = all 7) sets the **maximum** scope set the server _may_ request. Auto-detect (B2/B3 style) further narrows at runtime if the user enabled fewer APIs than the env var allows.

**Pros:**

- Matches least-privilege correctly: explicit user intent (env var) AND project-state reality (auto-detect).
- Backward compatible: no env var = all 7 ceiling, then narrowed by what's enabled.
- Surfaces misconfiguration: env var includes `gmail` but Gmail API not enabled → log a clear "enable Gmail API or remove gmail from GOOGLE_MCP_SCOPES" warning, downgrade gracefully.

**Cons:**

- Most complex to implement and explain.
- Auto-detect still has the bootstrap problem on first auth (we don't know what's enabled before grabbing a token).
- Overlapping mental model: now there are TWO things that can drop a scope (env + project state). Debugging "why is Gmail missing?" becomes harder.

## Recommendation

**Land PR #12 (Option A) first. Defer auto-detection to a follow-up issue, possibly never.**

Reasoning:

1. **Auto-detection's bootstrap problem is fundamental.** First-auth must request _something_; that something is either "all 7" (current behavior — the very thing we're fixing) or "user-stated subset" (Option A). There is no clean third option.
2. **The dogfood feedback's primary pain was over-grant on the OAuth screen** — Option A directly addresses this. Auto-detection's UX gain (skipping the env var setup) is real but secondary.
3. **Option C's complexity isn't justified** until we see real users hit the env-var-vs-project-state mismatch. We can layer C on top of A later without breaking anything.

If the user explicitly wants Option B/C now, the spec proceeds with the design below. Otherwise this section is the rationale for not building them.

## Implementation plan (if Option A only)

**Already done in PR #12:**

- `src/scopeConfig.ts` registry mapping domain → scopes + register fn
- `parseEnabledDomains` + `getEnabledScopes` with comprehensive tests
- Lazy `getScopes()` in `auth.ts` to avoid circular-init
- Skill + CLAUDE.md updates

**To finish PR #12 (review feedback from agent-skills:review on PR #12):**

1. Tighten `parseEnabledDomains` validation-message test to assert _all_ domain names appear in the message (not just `docs`).
2. Catch `parseEnabledDomains` throws at `index.ts` top level and exit with a clean log line, mirroring the existing BASE_URL/CLIENT_ID validation.
3. Decide on env var name: keep `GOOGLE_MCP_SCOPES` (consistent with existing `GOOGLE_*` prefix) vs rename to `GOOGLE_MCP_DOMAINS` (more accurate). If keeping current name, detect leading `https://` in input and emit a hint ("looks like a scope URL — pass domain names instead").
4. Add a small smoke test for `registerAllTools` that injects a fake `FastMCP` and asserts only opted-in domains' register fns ran.
5. Document the symmetric case in `scopeConfig.ts`: opting INTO `docs` forces `script.external_request` (currently only the opt-out direction is documented).
6. Optional: split `appsScript` as its own opt-in domain so users can grant `docs` without the Apps Script scope. Out of scope for this PR if we want the 80% win first.

**Future follow-up issue (Option C narrowing only):**

- Probe each enabled domain's API on server start. If `accessNotConfigured`, log a warning and skip registering that domain's tools. OAuth scopes already requested at auth time are unchanged; only the tool surface narrows.

## Implementation plan (if Option B chosen instead)

**Replaces PR #12 entirely.**

1. Implement B2 probe: at server start, attempt a cheap "list" call against each domain's API. Map error → enabled/disabled.
2. First-auth UX: still need to know which scopes to request. Either:
   - Always request all 7 on first auth (regresses on the privacy goal), OR
   - Add an env var anyway to declare intent (collapses to Option C, see above)
3. Cache probe results across runs (file in XDG state dir) with TTL, so we don't burn 7 RTTs on every restart.
4. Surface "API not enabled" errors at tool-call time with the same actionable message.

## Code style

Follows existing conventions. New code lives in `src/scopeConfig.ts` (already created in PR #12). One real example:

```typescript
export const ALL_DOMAINS: Record<string, DomainConfig> = {
  docs: {
    scopes: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/script.external_request',
    ],
    register: (server) => {
      registerDocsTools(server);
      registerUtilsTools(server);
    },
  },
  // ...
};
```

## Testing strategy

- Unit tests in `src/scopeConfig.test.ts` (already written, 18 tests covering parsing/scope-derivation).
- Integration: a single test in `src/tools/index.test.ts` (NEW) that injects a fake `FastMCP` and asserts conditional registration. Closes the gap flagged in PR #12 review.
- No live tests (gated on credentials).

## Boundaries

**Always:**

- Treat `GOOGLE_MCP_SCOPES` (or chosen name) as the explicit declaration of user intent.
- Fail loud on unknown domain names.
- Keep the registry the single source of truth for scope→tool mapping.

**Ask first:**

- Renaming the env var (breaks any existing dogfooders).
- Splitting `appsScript` as its own domain (changes default behavior for `docs` users).
- Adding new domains beyond the current 6.

**Never:**

- Auto-grant scopes the user didn't explicitly opt into.
- Persist a scope set wider than what was actually granted.
- Silently skip a tool registration without logging it.

## Success criteria

1. `GOOGLE_MCP_SCOPES=docs,drive npx auth` succeeds and writes a token containing only `documents`, `script.external_request`, `drive` scopes.
2. Server started with the same env var only registers `docs` and `drive` tools — `tools/list` does not include any Gmail/Slides/Sheets/Calendar tools.
3. `GOOGLE_MCP_SCOPES=bogus` throws on startup with a message naming `bogus` and listing valid domains.
4. `GOOGLE_MCP_SCOPES=` (empty) or unset behaves identically to v0.1.x — all 7 scopes, all tools.
5. Existing token files (no `scope` field) continue to work; the scope-coverage warning only fires when a `scope` field is present and incomplete.

## Open questions

1. **Recommendation accepted? (Option A only, defer B/C.)** Or does the user want B or C designed/built now?
2. **Env var name:** `GOOGLE_MCP_SCOPES` (keep) or `GOOGLE_MCP_DOMAINS` (rename for accuracy)?
3. **Apps Script split:** Bundle with `docs` (current PR #12) or separate domain (`appsScript`)?
4. Do we want a pre-publish issue tracking the Option C narrowing follow-up so it's not lost?

---

## Decision log

**2026-05-06 — fryorcraken**

- **Q1 (Recommendation):** Accepted. Land Option A (env var) via PR #12; defer auto-detect to a follow-up issue.
- **Q2 (Env var name):** Keep `GOOGLE_MCP_SCOPES` (matches existing `GOOGLE_*` prefix in this repo). Mitigate the "user passes scope URL" footgun by detecting leading `https://` in input and emitting a hint per the reviewer's suggestion.
- **Q3 (Apps Script split):** Defer. Bundle stays. File as a future enhancement if anyone hits real friction.
- **Q4 (Follow-up issue):** Yes — open a tracking issue for Option C narrowing (probe enabled APIs at runtime, narrow tool registration further).
