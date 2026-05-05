---
name: setup-google-docs-mcp
description: Walk a user through installing the @fryorcraken/google-docs-mcp server, creating Google Cloud OAuth credentials, completing the auth flow, and registering the server in Claude Desktop, Cursor, Windsurf, or VS Code. Use when the user says "set up google-docs-mcp", "install google-docs-mcp", "I need to connect Claude to Google Docs/Sheets/Drive/Gmail/Calendar", or hits OAuth errors during install.
---

# Setting up @fryorcraken/google-docs-mcp

Walks through the full install: Google Cloud OAuth client → npm install (or local build) → `auth` flow → MCP client registration. Covers stdio mode (single user, local). For remote/Cloud Run deployment see the project's `README.md`.

## Decision tree

Before starting, decide:

1. **Install method**: `npx` (fastest, no clone) or local build (for development)?
2. **Single-account vs multi-account**: do you need separate token storage per project?
3. **Which MCP client**: Claude Desktop, Cursor, Windsurf, VS Code?

The defaults are: `npx`, single account, Claude Desktop. Adjust below as needed.

## Step 1 — Google Cloud OAuth client (one-time, per Google account)

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. **APIs & Services → Library**, enable **all five** APIs (the server requests scopes for all of them unconditionally on auth — skipping any one will cause `invalid_scope` during the auth flow):
   - Google Docs API
   - Google Sheets API
   - Google Drive API
   - Gmail API
   - Google Calendar API
   - Apps Script API (only required if you'll use the Apps Script integration for image insertion; safe to enable always)
4. **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless on a Google Workspace org and you want Internal)
   - Add the user's own email under **Test users**
   - Scopes section: you don't need to pre-add scopes — the server's OAuth request includes the full list (`documents`, `drive`, `spreadsheets`, `script.external_request`, `gmail.modify`, `calendar.events`) and Google will surface them on first authorization.
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**
   - Note the **Client ID** and **Client Secret** from the confirmation popup.

Common gotcha: if the OAuth consent screen is in "Testing" status, only emails listed under Test users can authorize. Either add the user, or publish the consent screen.

## Step 2 — Authorize

```bash
GOOGLE_CLIENT_ID="<from-step-1>" \
GOOGLE_CLIENT_SECRET="<from-step-1>" \
npx -y @fryorcraken/google-docs-mcp auth
```

What this does:

- Spins up a localhost HTTP listener on a random port for the OAuth callback.
- Opens (or prints) the Google authorization URL.
- After the user approves in the browser, the refresh token is saved to `${XDG_CONFIG_HOME:-~/.config}/google-docs-mcp/token.json` (mode 0600).
- The local server then shuts down. The 5-minute timeout will reject the flow with a clear error if the user doesn't complete it in time.

### Multi-account (one token per project)

Set `GOOGLE_MCP_PROFILE=<name>` before the `auth` command and the same value when running the server. Tokens go to `~/.config/google-docs-mcp/<profile>/token.json`. Profile names are restricted to alphanumerics, hyphens, and underscores.

```bash
GOOGLE_MCP_PROFILE=work \
GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
npx -y @fryorcraken/google-docs-mcp auth
```

### Service account (no browser flow)

If running on Cloud Run, a server, or for non-interactive automation: skip the browser flow entirely. Set `SERVICE_ACCOUNT_PATH` to a service account JSON key file, optionally with `GOOGLE_IMPERSONATE_USER` for domain-wide delegation. The server will JWT-auth on startup.

## Step 3 — Register with the MCP client

### Claude Desktop / Cursor / Windsurf

Add to the MCP servers config:

```json
{
  "mcpServers": {
    "google-docs": {
      "command": "npx",
      "args": ["-y", "@fryorcraken/google-docs-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "<from-step-1>",
        "GOOGLE_CLIENT_SECRET": "<from-step-1>"
      }
    }
  }
}
```

Add `"GOOGLE_MCP_PROFILE": "<name>"` to `env` if using profiles.

Config file paths:

- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%/Claude/claude_desktop_config.json`
- **Cursor**: Settings → MCP → Add new MCP server (project-level: `.cursor/mcp.json`)
- **Windsurf**: Settings → Cascade → MCP

Restart the MCP client after editing.

### VS Code (with the MCP extension)

See `vscode.md` in the project root for the full walkthrough.

## Verifying it works

In the MCP client, ask the agent to call `listDocuments` (or similar harmless read tool). On success, the agent receives a JSON list of recent docs. On failure, the error message is usually descriptive — see Troubleshooting.

## Troubleshooting

**`No OAuth credentials found`** at startup → env vars `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` missing from the MCP client config, OR no `credentials.json` in the project root for local-dev installs. The MCP client's `env` block is what passes them through.

**`Authorization error: access_denied`** during `auth` flow → user rejected, OR consent screen status is "Testing" and the user isn't in Test users.

**`OAuth callback not received within 300s`** → user closed the browser tab without completing. Re-run the `auth` command.

**`Permission denied for document` (HTTP 403)** at runtime → the authorized user doesn't have access to that doc, OR Google Workspace admin has restricted the Docs API. The server falls back to Drive `files.export` for plain-text reads when Docs API 403s — markdown/json formats can't fall back.

**Tools not appearing in the MCP client** → restart the client after editing config. If using `npx`, the first invocation may be slow (download time) — wait 30–60s.

**Server hangs / "appears empty" on a Google Doc with tabs** → known fixed in v0.2.0+ (issue #1). If on an older fork, upgrade.

## For openclaw users

If running the MCP via openclaw on an agent workspace at `~/.openclaw/workspace/<name>`:

1. Run the `auth` flow once on the marclaw host (interactive, requires browser tunnel or local Mac+ssh forward). Token lands in `~/.config/google-docs-mcp/token.json` on marclaw.
2. Make this skill available to the openclaw agent: symlink `.claude/skills/setup-google-docs-mcp/` into `~/.openclaw/workspace/<name>/.claude/skills/`, OR copy it to `~/.claude/skills/` on marclaw for global discovery.
3. Configure the MCP server in the agent's workspace MCP config (varies by openclaw setup).

Token storage uses XDG paths and is shared across openclaw agents on the same host unless `GOOGLE_MCP_PROFILE` is set per agent.

## Resources

- **Repo**: https://github.com/fryorcraken/google-docs-mcp
- **Issues**: https://github.com/fryorcraken/google-docs-mcp/issues
- **Tool catalog**: `docs/TOOLS.md` in the repo (also see the `using-google-docs-mcp` skill for runtime guidance)
- **Upstream**: https://github.com/a-bonus/google-docs-mcp (this is a fork)
