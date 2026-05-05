---
name: setup-google-docs-mcp
description: Walk a user through installing the @fryorcraken/google-docs-mcp server, creating Google Cloud OAuth credentials, completing the auth flow, and registering the server in Claude Code, Claude Desktop, Cursor, Windsurf, or VS Code. Use when the user says "set up google-docs-mcp", "install google-docs-mcp", "I need to connect Claude to Google Docs/Sheets/Drive/Slides/Gmail/Calendar", or hits OAuth errors during install.
---

# Setting up @fryorcraken/google-docs-mcp

Walks through the full install: Google Cloud OAuth client → npm install (or local build) → `auth` flow → MCP client registration. Covers stdio mode (single user, local). For remote/Cloud Run deployment see the project's `README.md`.

> ⚠️ **Scope-permission default.** By default the server requests OAuth scopes for **all 6 domains** (Docs+Apps Script, Drive, Sheets, Slides, Gmail, Calendar = 7 scopes). You can opt into a subset via `GOOGLE_MCP_SCOPES` (see [Limited scopes](#limited-scopes-least-privilege) below) — only the named domains' scopes are requested AND only those tools are registered. If you stick with the default, you MUST enable all 7 APIs in your Cloud project or the OAuth flow will fail with `invalid_scope`.
>
> ⚠️ **Don't paste OAuth secrets into LLM chat.** The secret will hit the model provider's logs. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as env vars in your shell and tell the LLM "I've set them in my shell" rather than pasting the values.

## Decision tree

Before starting, decide:

1. **Install method**: `npx` (fastest, no clone) or local build (for development / dogfooding the repo)?
2. **Single-account vs multi-account**: do you need separate token storage per project?
3. **Which MCP client**: Claude Code, Claude Desktop, Cursor, Windsurf, VS Code?

The defaults are: `npx`, single account, Claude Code. Adjust below as needed.

## Step 1 — Google Cloud OAuth client (one-time, per Google account)

> Google reorganized this UI in 2025. The flow below matches the current console (verified 2026-05).

### 1.1 Create or pick a project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Top bar → project picker → **New Project** (or select existing).

### 1.2 Enable the seven APIs

The server requests scopes for all of them on auth. Each link below opens the API library page directly — click **Enable** on each:

- [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
- [Google Slides API](https://console.cloud.google.com/apis/library/slides.googleapis.com)
- [Apps Script API](https://console.cloud.google.com/apis/library/script.googleapis.com)
- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar.googleapis.com)

Skipping any one of these will cause `invalid_scope` during the auth flow.

### 1.3 Configure Google Auth Platform (one-time per project)

In **APIs & Services → OAuth consent screen** you'll see "Google Auth Platform not configured yet" → **Get started**. Walk the wizard:

- **App Information**: app name + your support email
- **Audience**: External (unless you're on a Workspace org and want Internal)
- **Contact Information**: your email
- **Finish** → agree to policy → **Continue** → **Create**

### 1.4 Add yourself as a Test user

If your app is in **Testing** status (the default), only emails listed under Test users can authorize.

Left sidebar → **Audience** → **Test users** → **+ Add users** → add your Google account email.

### 1.5 Create the OAuth client

Left sidebar → **Clients** → **+ Create Client**:

- Application type: **Desktop app**
- Note the **Client ID** and **Client Secret** from the confirmation popup.

> 💡 **Don't panic if you close the popup.** The Client Secret can be re-downloaded later: **Clients** → click your client → **Download JSON** button.

## Step 2 — Authorize

Set the secrets in your **current shell** (the same shell that will run the auth command — env vars don't propagate across shells):

```bash
export GOOGLE_CLIENT_ID="<from-step-1.5>"
export GOOGLE_CLIENT_SECRET="<from-step-1.5>"
npx -y @fryorcraken/google-docs-mcp auth
```

What happens:

1. Spins up a localhost HTTP listener on a random port for the OAuth callback.
2. Opens your browser to the Google authorization URL (or prints it on stderr).
3. After you approve in the browser, the refresh token is saved to `${XDG_CONFIG_HOME:-~/.config}/google-docs-mcp/token.json` (mode 0600). The directory is created on first auth — don't pre-create it.
4. The local server shuts down. The 5-minute timeout will reject with a clear error if you don't complete in time.

### Headless / SSH dev box

The auth command opens a browser via `open` / `xdg-open`. On a headless server or SSH session this fails silently. Two workarounds:

- **Copy the URL to a local browser**: grep stderr for the listening port, copy the printed `https://accounts.google.com/o/oauth2/v2/auth?...` URL into your local browser, complete auth. The OAuth redirect target is `http://localhost:<port>`, which only resolves on the remote box where `auth` is running — so before submitting the consent, set up an SSH tunnel from your laptop:

  ```bash
  # On your laptop, in another terminal — tunnels your laptop's
  # localhost:<port> to the listener on the remote box:
  ssh -L <port>:localhost:<port> <remote>
  ```

- **Auth on a workstation, copy the token**: run `auth` on a machine with a browser, then `scp ~/.config/google-docs-mcp/token.json` to the headless box.

### Limited scopes (least privilege)

If you only need a subset of Google services — say, just Docs and Drive — set `GOOGLE_MCP_SCOPES` to a comma-separated list of domain names. The auth flow will only request those scopes, AND only those tools will register at startup, so you can't accidentally call a Gmail tool you didn't grant.

Valid domains (case-insensitive): `docs`, `drive`, `sheets`, `slides`, `gmail`, `calendar`.

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export GOOGLE_MCP_SCOPES="docs,drive"
npx -y @fryorcraken/google-docs-mcp auth      # auth requests only docs+drive scopes
# Then add to your MCP client with the same env var:
claude mcp add google-docs --scope user \
  -e GOOGLE_CLIENT_ID="..." \
  -e GOOGLE_CLIENT_SECRET="..." \
  -e GOOGLE_MCP_SCOPES="docs,drive" \
  -- npx -y @fryorcraken/google-docs-mcp
```

What this changes:

- **Cloud project**: you only need to enable the APIs for the domains you opt into. Skipping any other API is fine.
- **OAuth scopes requested**: only the ones for opted-in domains.
- **Tools registered**: only the ones in opted-in domains. Gmail/Calendar/Slides/Sheets tools simply don't appear in `tools/list` if you didn't include them.
- **Token re-auth**: if you change `GOOGLE_MCP_SCOPES` later (adding a domain), re-run `auth` — the saved-token-missing-scopes warning will surface at startup.

Note on the Apps Script scope (`script.external_request`): it's bundled under `docs` because the only consumer (Apps Script image insertion in `insertImage`) is a Docs feature. Opt out of `docs` and the Apps Script scope is also dropped.

### Multi-account (one token per project)

Set `GOOGLE_MCP_PROFILE=<name>` before the `auth` command and the same value when running the server. Tokens go to `~/.config/google-docs-mcp/<profile>/token.json`. Profile names: alphanumerics, hyphens, underscores only.

```bash
GOOGLE_MCP_PROFILE=work \
GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
npx -y @fryorcraken/google-docs-mcp auth
```

### Service account (no browser flow)

Cloud Run / server / non-interactive automation: skip the browser flow. Set `SERVICE_ACCOUNT_PATH` to a service account JSON key file, optionally with `GOOGLE_IMPERSONATE_USER` for domain-wide delegation.

## Step 3 — Register with the MCP client

### Claude Code (CLI)

Likely the most common surface for someone working on this repo:

```bash
# Project-local (only this directory)
claude mcp add google-docs \
  -e GOOGLE_CLIENT_ID="..." -e GOOGLE_CLIENT_SECRET="..." \
  -- npx -y @fryorcraken/google-docs-mcp

# Global (all projects, --scope user)
claude mcp add google-docs --scope user \
  -e GOOGLE_CLIENT_ID="..." -e GOOGLE_CLIENT_SECRET="..." \
  -- npx -y @fryorcraken/google-docs-mcp
```

`claude mcp list` lists all configured servers. No restart required between adds.

### Claude Desktop / Cursor / Windsurf

```json
{
  "mcpServers": {
    "google-docs": {
      "command": "npx",
      "args": ["-y", "@fryorcraken/google-docs-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "..."
      }
    }
  }
}
```

Add `"GOOGLE_MCP_PROFILE": "<name>"` to `env` for multi-account.

Config file paths:

- **Claude Desktop (macOS)**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%/Claude/claude_desktop_config.json`
- **Cursor**: Settings → MCP → Add new MCP server (project-level: `.cursor/mcp.json`)
- **Windsurf**: Settings → Cascade → MCP

Restart the MCP client after editing.

### VS Code (with the MCP extension)

See `vscode.md` in the project root for the full walkthrough.

### Local build (for contributors / dogfooding)

If you've cloned the repo and want to run your own `dist/index.js` instead of the published package:

```bash
git clone https://github.com/fryorcraken/google-docs-mcp.git
cd google-docs-mcp
npm install
npm run build  # required — produces dist/index.js
```

Then in your MCP config (Claude Desktop / Cursor / Windsurf shape):

```json
{
  "mcpServers": {
    "google-docs": {
      "command": "node",
      "args": ["/absolute/path/to/google-docs-mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "...",
        "GOOGLE_CLIENT_SECRET": "..."
      }
    }
  }
}
```

Or with Claude Code:

```bash
claude mcp add google-docs-local \
  -e GOOGLE_CLIENT_ID="..." -e GOOGLE_CLIENT_SECRET="..." \
  -- node /absolute/path/to/google-docs-mcp/dist/index.js
```

> ⚠️ Use absolute paths — JSON config does not expand `~`. Re-run `npm run build` after every code change.

### Make this skill globally discoverable

If you've cloned the repo and want this skill (and `using-google-docs-mcp`) available to every Claude Code session, not just when CWD is the repo:

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/.claude/skills/setup-google-docs-mcp" ~/.claude/skills/
ln -s "$(pwd)/.claude/skills/using-google-docs-mcp" ~/.claude/skills/
```

For openclaw, symlink into `~/.openclaw/workspace/<agent>/.claude/skills/` instead.

## Verifying it works

In the MCP client, ask the agent to call `listDriveFiles` (or any harmless read tool — `listDocuments` returns Google Docs in your Drive, `listSlides` needs a presentationId). On success the agent gets a JSON list. On failure the error message is descriptive — see Troubleshooting.

> 📛 **Tool name vs file name.** This server registers tools whose names sometimes differ from their source file names. The authoritative tool name is the `name:` field passed to `server.addTool({ ... })` — not the filename. Examples:
>
> | File                                           | Registered tool name (use this) |
> | ---------------------------------------------- | ------------------------------- |
> | `src/tools/drive/listGoogleDocs.ts`            | `listDocuments`                 |
> | `src/tools/drive/searchGoogleDocs.ts`          | `searchDocuments`               |
> | `src/tools/utils/appendMarkdownToGoogleDoc.ts` | `appendMarkdown`                |
>
> If a tool call fails with "tool not found", check `name:` in the source file rather than the filename. `claude mcp list` (Claude Code) and the JSON-RPC `tools/list` request both return the registered name.

## Troubleshooting

**`No OAuth credentials found`** at startup → env vars missing from the MCP client config, OR no `credentials.json` in the project root for local-dev installs. The MCP client's `env` block is what passes them through.

**`invalid_scope`** during `auth` flow → one of the seven APIs in step 1.2 is not enabled. The error message names which scope was rejected; map it back to the API:

| Scope                     | API to enable       |
| ------------------------- | ------------------- |
| `documents`               | Google Docs API     |
| `drive`                   | Google Drive API    |
| `spreadsheets`            | Google Sheets API   |
| `presentations`           | Google Slides API   |
| `script.external_request` | Apps Script API     |
| `gmail.modify`            | Gmail API           |
| `calendar.events`         | Google Calendar API |

**`Authorization error: access_denied`** → user rejected, OR consent screen status is "Testing" and the user isn't in Test users (step 1.4).

**`OAuth callback not received within 300s`** → user closed the browser tab without completing. Re-run the `auth` command.

**`Permission denied for document` (HTTP 403)** at runtime → the authorized user doesn't have access to that doc, OR Workspace admin has restricted the API. The server falls back to Drive `files.export` for plain-text reads on 403.

**Tools not appearing in the MCP client** → for Claude Desktop / Cursor / Windsurf, restart after editing config. For Claude Code, no restart — `claude mcp list` should show the server. If using `npx`, the first invocation may be slow (download time) — wait 30–60s.

**`Saved token is missing required scopes` warning at startup** → you upgraded the server and it added new scopes (most recently `presentations` for Slides support). Re-run the `auth` command to refresh the token.

**`credentials.json` security note** → if you use the legacy `credentials.json` fallback (file in project root, no env vars), that file contains your OAuth secret. Confirm `.gitignore` covers it (the repo's `.gitignore` already covers `credentials.json`) before committing.

**Server hangs / "appears empty" on a Google Doc with tabs** → fixed in v0.2.0+ (issue #1). Upgrade if on an older fork.

## For openclaw users

Running the MCP via openclaw on an agent workspace at `~/.openclaw/workspace/<name>`:

1. Run the `auth` flow once on the marclaw host (interactive — needs a browser, so use the SSH-forward trick from Step 2 if marclaw is headless). Token lands in `~/.config/google-docs-mcp/token.json`.
2. Symlink this skill into the agent workspace: `ln -s /path/to/google-docs-mcp/.claude/skills/setup-google-docs-mcp ~/.openclaw/workspace/<name>/.claude/skills/`. Or place at `~/.claude/skills/` for global discovery.
3. Configure the MCP server in the agent's workspace MCP config.

Token storage uses XDG paths and is shared across openclaw agents on the same host unless `GOOGLE_MCP_PROFILE` is set per agent.

## Resources

- **Repo**: https://github.com/fryorcraken/google-docs-mcp
- **Issues**: https://github.com/fryorcraken/google-docs-mcp/issues
- **Tool catalog**: `docs/TOOLS.md` in the repo (also see the `using-google-docs-mcp` skill)
- **Upstream**: https://github.com/a-bonus/google-docs-mcp (this is a fork)
