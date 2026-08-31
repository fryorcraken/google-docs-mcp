# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

Hard fork of [`a-bonus/google-docs-mcp`](https://github.com/a-bonus/google-docs-mcp), maintained as `@fryorcraken/google-docs-mcp`. Dual-licensed MIT or Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`).

This is a [FastMCP](https://github.com/punkpeye/fastmcp) server exposing ~128 tools for Google Docs, Sheets, Slides, Drive, Gmail, and Calendar over the Model Context Protocol. It runs in two modes: stdio (default, used by Claude Desktop / Cursor / Windsurf) and `httpStream` (remote, for Cloud Run with MCP OAuth 2.1).

## Common commands

```bash
npm install                               # install
npm run build                             # tsc → dist/
npm test                                  # vitest run (~255 tests)
npm test -- --run path/to/file.test.ts    # one file
npm test -- --run -t 'partial test name'  # one test
npm run test:live:docs                    # live tests (need OAuth token; opt-in)
npm run format                            # prettier --write .
npm run format:check                      # CI checks this
npm start                                 # run built server (stdio mode)
npm start auth                            # interactive OAuth flow → token
```

CI runs `npm test` and `npm run format:check` against Node 20/22/24/25 on every PR. Commits land directly on `main` — push when local tests and `format:check` pass; CI verifies post-push.

## Architecture

### Two run modes, one entry point

`src/index.ts` decides between stdio and `httpStream` via `MCP_TRANSPORT`. Both modes register the same tool set via `src/tools/index.ts`. Differences:

- **stdio mode**: single user, credentials from env vars or `~/.config/google-docs-mcp/token.json`, all tool handlers share one `OAuth2Client` from `src/clients.ts`.
- **httpStream mode**: multi-tenant, FastMCP's `OAuthProxy` handles per-user OAuth 2.1, tokens persist in Firestore (`src/firestoreTokenStorage.ts`) when `TOKEN_STORE=firestore`. Per-request Google clients are stashed in an `AsyncLocalStorage` by `src/remoteWrapper.ts:wrapServerForRemote` — every tool gets auth wrapping for free without per-tool changes.

`src/index.ts` also monkey-patches `oauthProxy.issueSwappedTokens` to work around an upstream FastMCP bug where `accessTokenTtl` config is ignored when Google returns a non-zero `expiresIn`. Don't remove without checking the upstream issue.

### Tab-aware tool pattern (mandatory for new doc tools)

Google Docs that have multiple tabs (introduced 2024) store content under `documentTab.body` instead of the legacy top-level `body`. Tools that don't account for this fail with `Field mask cannot retrieve comment-specific fields when include_comments is false` or silently return empty content. **Every tool that takes a position (insert/delete/modify/format) must auto-detect tabbed docs.**

Use the helpers in `src/googleDocsApiHelpers.ts`:

- `resolveTab(docs, documentId, requestedTabId?)` — issues one `documents.get` with `TAB_RESOLUTION_FIELDS` and returns `{ tabId, isTabbed, firstTabId }`. Throws `UserError` on bad `tabId`.
- `resolveTabFromDocument(doc, documentId, requestedTabId?)` — same logic against an already-fetched document. Use this when the tool already needs a full `documents.get` for content; saves an RTT and avoids the race window between two sequential gets.
- When composing your own field mask for the optimized path, include `tabs(${TAB_RESOLUTION_FIELDS_INNER},...)` so `resolveTabFromDocument` can find tabs nested under `childTabs`.

Canonical patterns:

```typescript
// Standalone (most write tools — see src/tools/docs/insertText.ts)
const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);
// then use tab.tabId in batchUpdate Location/Range

// Optimized (when you already need to fetch — see src/tools/docs/replaceTableRowData.ts)
const res = await docs.documents.get({ documentId, includeTabsContent: true, fields: '...' });
const tab = GDocsHelpers.resolveTabFromDocument(res.data, documentId, args.tabId);
```

For read tools that share extraction logic via `src/tools/docs/structureHelpers.ts` or `smartChipHelpers.ts`, route through `src/tools/docs/contentSource.ts:getContentSource(doc, tabId?)`. It throws `UserError` on bad `tabId` and falls back to first tab when `tabId` is unset on a tabbed doc.

Compose `OptionalTabIdParameter` from `src/types.ts` into the tool's Zod schema for a consistent parameter description.

### Tool registration

Each tool lives in `src/tools/<domain>/<toolName>.ts` and exports a `register(server: FastMCP)` function that calls `server.addTool({ name, description, parameters, execute })`. Domain index files (`src/tools/<domain>/index.ts`) wire up registration; `src/tools/index.ts` is the top-level router.

`src/cachedToolsList.ts` caches the tool listing in stdio mode so `tools/list` requests don't pay the Zod-to-JSONSchema conversion cost on every call.

### Lazy tool discovery (`MCP_LAZY_TOOLS=1`)

By default, all ~128 tools are advertised in `tools/list` — that's ~32k tokens of passive context shipped to the model on every session, paid even when the agent never touches the MCP. `MCP_LAZY_TOOLS=1` flips the server into lazy mode: `tools/list` exposes only **three meta-tools** (~500 tokens), and the real tools are reachable via routing:

- `searchTools({query?, domain?, limit?})` — find tools by keyword / domain. Domains: `docs`, `sheets`, `drive`, `gmail`, `calendar`, `slides`, `utils`.
- `describeTool({name})` — fetch full description + JSON schema for one tool.
- `callTool({name, args})` — invoke any tool by name; args are validated against the tool's Zod schema before execution.

Mechanism: `src/lazyMode.ts:startLazyCapture` replaces `server.addTool` with a function that pushes captured tool definitions into an in-memory registry instead of registering them with FastMCP. After all domain `register()` calls finish, `finalizeLazyMode` adds the 3 meta-tools through the unwrapped addTool so they are visible. The remote-mode auth wrapper (`wrapServerForRemote`) runs _before_ the lazy capture, so the 3 meta-tools still get auth enforcement; the inner tools' Google clients come from the same `requestClients` AsyncLocalStorage that wraps the meta-tool execution.

Tradeoff: one extra round-trip per new capability the agent uses (search → describe → call), versus a much smaller passive context. Workflows that touch many tools may prefer eager mode.

### Edit-in-place workflow

Tools for editing existing Google Docs without rewriting them:

- **Insert at a position**: `insertText`, `insertTable`, `insertImageFromUrl`/`insertLocalImage`, `insertPageBreak`, `insertSectionBreak`, `insertDateChip`, `insertPerson`, `insertRichLink`
- **Insert _markdown-formatted_ content at a position**: `insertMarkdown` — takes `{index}` or `{textToFind, position: 'before' | 'after'}`. Use when inserting a new section (with heading/list styling) mid-document.
- **Delete or replace by range**: `deleteRange`, `findAndReplace` (text only), `modifyText` (text + restyle)
- **Delete an entire paragraph by text anchor**: `deleteParagraphContaining` — wraps the "find textRun → derive paragraph range → deleteRange" pattern; re-resolves the anchor from current state so it composes safely with other text-anchored edits.
- **Get a paragraph's range without reading the doc**: `findParagraphRange` — pure read helper that returns `{startIndex, endIndex, tabId}`. Use when you need raw indices for low-level tools and want to skip the `readDocument` → JSON-grep detour.
- **Replace by range _with markdown formatting_**: `replaceRangeWithMarkdown` — takes either `{startIndex, endIndex}` or `{textToFind, matchInstance}`. Use this when the replacement needs headings/lists/links/etc.
- **Restyle a range**: `applyTextStyle`, `applyParagraphStyle`, `formatMatchingText`
- **Link text to a heading (real internal link, same tab or another tab)**: `listHeadings` to get a heading's `headingId`, then `applyTextStyle`/`modifyText` with `style.linkHeading: {headingId, tabId?}` — builds a native Docs `Link.heading` anchor via `buildUpdateTextStyleRequest` in `googleDocsApiHelpers.ts`. Unlike `style.linkUrl`, this stays correct if the heading text is later edited. Omit `linkHeading.tabId` for a same-tab link (defaults to the styled range's own tab); set it to point at a heading in a different tab.
- **Add / remove paragraph bullets**: `updateParagraphBullets` — `action: 'remove'` clears the bullet attribute (e.g. on a heading that inherited one); `action: 'set'` with a `bulletPreset` applies / changes the glyph. `applyParagraphStyle` deliberately does not touch the bullet attribute, so this tool is the only path for surgical bullet edits. **Limitation:** `'set'` always creates a fresh list from a preset — it cannot attach to a specific existing list (the Docs API has no such operation). For custom-glyph lists (e.g. literal `-`), use `addListItem` instead.
- **Unbullet a paragraph (one-shot)**: `unbulletParagraph` — bundles optional leading-prefix strip + `deleteParagraphBullets` + `namedStyleType` set (default `NORMAL_TEXT`) + inherited-inline-style clear (bold/italic/underline/strikethrough/link). Replaces a 3–4 call sequence whose order and index arithmetic was a recurring foot-gun.
- **Add an item to an existing custom-glyph list**: `addListItem` — takes a `donor` paragraph already in the list and a `text` for the new item. The Docs API's only paragraph-to-list mechanism is the "inserting `\n` mid-paragraph copies bullet style to the new paragraph" rule; this tool exploits exactly that. New item lands directly after the donor.
- **Whole-doc markdown rewrite**: `replaceDocumentWithMarkdown`
- **Append**: `appendToGoogleDoc`, `appendMarkdownToGoogleDoc`
- **Tables**: `editTableCell`, `replaceTableRowData`, `appendDocTableRows`, `deleteTableRows`, `cloneTable`
- **Comments**: `listComments`, `addComment`, `replyToComment`, `resolveComment`, `deleteComment`, `getComment`

Canonical agent workflow for "edit this section": call `readDocument` with `format='json'` to find indices (or `format='markdown'` for human-readable inspection), then either compose the inserts/deletes manually or call `replaceRangeWithMarkdown` for a one-shot formatted replacement.

### Helper modules

- `src/googleDocsApiHelpers.ts` — batch update execution (with auto-splitting via `executeBatchUpdateWithSplitting` for >50 requests), text-range finding, style request builders, table helpers, tab resolution.
- `src/googleSheetsApiHelpers.ts` — A1 notation parsing, format/protection helpers, table helpers.
- `src/markdown-transformer/` — bidirectional Markdown ↔ Docs JSON conversion. Code blocks render as styled 1×1 tables (matching Docs' Code Block building block).
- `src/auth.ts` — OAuth resolution (`SERVICE_ACCOUNT_PATH` → saved token → interactive). XDG-aware token path, `GOOGLE_MCP_PROFILE` for multi-account. `waitForOAuthCallback` is exported for tests.

### Output rules

All log output **must** go to stderr via `src/logger.ts`. Stdout is reserved for the MCP protocol when running in stdio mode — anything else corrupts the JSON stream. Never `console.log` from inside a tool handler.

## Conventions

- TypeScript strict mode, ESM modules — imports use `.js` extensions for source `.ts` files (NodeNext resolution).
- Zod schemas with `.describe()` on every parameter; the descriptions become tool documentation visible to LLMs.
- Throw `UserError` from `fastmcp` for user-facing errors (surfaces cleanly in MCP clients). Plain `throw` for internal/programmer errors.
- Tool names are camelCase, verb-first (`readDocument`, `formatCells`, `insertText`).
- Tests live alongside source files (`<name>.test.ts`). Live tests use `.live.test.ts` suffix and are excluded from default `npm test`. Mock `getDocsClient`/`getDriveClient` from `src/clients.js` and (when needed) helpers via `vi.mock(..., async (importOriginal) => ({ ...await importOriginal(), helperName: vi.fn() }))` so the rest of the helper module stays real.
- The `captureToolExecute` pattern (see `src/tools/docs/insertText.test.ts` and `readGoogleDoc.test.ts`) extracts a tool's `execute` function from a fake FastMCP `addTool` for direct invocation in tests.

## Auth

OAuth client ID + secret resolution, in priority order:

1. `SERVICE_ACCOUNT_PATH` env var → service account JWT (with optional `GOOGLE_IMPERSONATE_USER`).
2. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` env vars → OAuth (canonical for npx/Cloud Run).
3. `credentials.json` in project root → OAuth (local dev fallback).

Tokens persist to `${XDG_CONFIG_HOME:-~/.config}/google-docs-mcp/token.json` (mode 0600, dir 0600). When `GOOGLE_MCP_PROFILE` is set, tokens go in a per-profile subdirectory (alphanumerics/hyphens/underscores only — validated).

OAuth scopes and tool registration are driven by a single registry in `src/scopeConfig.ts:ALL_DOMAINS`. Each domain entry maps a user-facing name (`docs`, `drive`, `sheets`, `slides`, `gmail`, `calendar`) to its scope strings AND its `register(server)` function. `src/auth.ts` and `src/index.ts:GOOGLE_API_SCOPES` derive their scope list from this registry, and `src/tools/index.ts:registerAllTools` derives the registration loop. **When adding a new domain, edit `scopeConfig.ts` only — the rest follows.**

`GOOGLE_MCP_SCOPES=docs,drive` (env var) opts into a least-privilege subset: only those domains' scopes are requested at auth, and only those tools are registered. Empty/unset = all domains (backward compatible). Validation is fail-loud: an unknown name in the comma-list throws on startup.

Note: `auth.ts` resolves the scope list lazily (`getScopes()`) rather than at module-load to avoid a circular-init cycle (`scopeConfig` → tool register fns → `clients` → `auth` → `scopeConfig`). Don't switch back to a top-level `const SCOPES = ...`.

Tokens persist to `${XDG_CONFIG_HOME:-~/.config}/google-docs-mcp/token.json` (mode 0600, dir 0600). When `GOOGLE_MCP_PROFILE` is set, tokens go in a per-profile subdirectory (alphanumerics/hyphens/underscores only — validated). The persisted JSON includes the granted `scope` string so the next startup can detect coverage gaps and warn the user to re-auth.

## See also

- `docs/TOOLS.md` — full tool catalog with parameter patterns, markdown support details, and known limitations
- `CONTRIBUTING.md` — local setup, OAuth setup, scripts table, release flow
- `README.md` — user-facing setup including Cloud Run remote deployment
