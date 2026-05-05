---
name: google-docs-mcp
description: "Work with Google Docs, Sheets, Drive, Gmail, and Calendar via the @a-bonus/google-docs-mcp server. Use when you need to read, create, or edit Google Docs; read or write Google Sheets; search Drive; manage Gmail drafts/messages; or create/update Calendar events. Provides 96 tools via MCP server. Note: Tabbed documents have a known bug - use direct API workaround documented in this skill."
---

# Google Docs MCP

Work with Google Workspace via the `@a-bonus/google-docs-mcp` MCP server (v1.9.0).

## MCP Tools Available

The MCP server exposes 96 tools. Key categories:

| Category | Tools | Notes |
|----------|-------|-------|
| **Docs** | `readDocument`, `appendText`, `appendMarkdown`, `insertText`, `deleteRange`, `findAndReplace`, `applyTextStyle`, `applyParagraphStyle` | Read/write Google Docs |
| **Tabs** | `listTabs`, `addTab`, `renameTab` | Document tabs (see bug below) |
| **Sheets** | `readSpreadsheet`, `writeSpreadsheet`, `appendRows`, `formatCells`, `insertChart` | Read/write spreadsheets |
| **Drive** | `listDocuments`, `listDriveFiles`, `searchDocuments`, `searchDriveFiles`, `copyFile`, `moveFile`, `deleteFile` | File management |
| **Gmail** | `listMessages`, `getMessage`, `createDraft`, `sendDraft`, `sendEmail` | Email (may return 403 if scope not enabled) |
| **Calendar** | `listEvents`, `createEvent`, `updateEvent`, `deleteEvent` | Calendar (may return 403 if scope not enabled) |

## Known Bug: Tabbed Documents

**Problem:** The MCP tools return an error when reading tabbed documents:

```
Field mask cannot retrieve comment-specific fields when include_comments is false
```

This affects documents that have multiple tabs (introduced in Google Docs 2024).

**Solution:** Use direct Google Docs API calls with `includeTabsContent=true`.

### Workaround: Direct API Access

**1. Get fresh OAuth token:**

```bash
node << 'EOF'
const fs = require('fs');
const https = require('https');
const querystring = require('querystring');
const token = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/google-docs-mcp/token.json', 'utf8'));
const env = fs.readFileSync(process.env.HOME + '/.openclaw/secrets/google-docs-mcp.env', 'utf8');
const clientSecret = env.match(/GOOGLE_CLIENT_SECRET=(.+)/)[1].trim();
const postData = querystring.stringify({
  client_id: token.client_id,
  client_secret: clientSecret,
  refresh_token: token.refresh_token,
  grant_type: 'refresh_token',
  scope: 'https://www.googleapis.com/auth/documents'
});
const req = https.request({hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}}, (res) => { let data = ''; res.on('data', d => data += d); res.on('end', () => console.log(JSON.parse(data).access_token)); });
req.write(postData); req.end();
EOF
```

**2. List tabs in a document:**

```bash
ACCESS_TOKEN="<token>"
DOC_ID="<document-id>"
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID?includeTabsContent=true" \
  | jq '.tabs[] | {tabId: .tabProperties.tabId, title: .tabProperties.title}'
```

**3. Insert text into a specific tab:**

```bash
curl -s -X POST -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID:batchUpdate" \
  -d '{"requests":[{"insertText":{"location":{"index":1,"tabId":"<tab_id>"},"text":"<content>"}}]}'
```

**4. Delete content from a specific tab:**

```bash
curl -s -X POST -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID:batchUpdate" \
  -d '{"requests":[{"deleteContentRange":{"range":{"startIndex":X,"endIndex":Y,"tabId":"<tab_id>"}}}]}'
```

**5. Apply heading styles (then remove # markers):**

```bash
# Apply heading style
curl -s -X POST -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID:batchUpdate" \
  -d '{"requests":[{"updateParagraphStyle":{"range":{"startIndex":X,"endIndex":Y,"tabId":"<tab_id>"},"paragraphStyle":{"namedStyleType":"HEADING_1"},"fields":"namedStyleType"}}]}'

# Remove the # marker
curl -s -X POST -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID:batchUpdate" \
  -d '{"requests":[{"deleteContentRange":{"range":{"startIndex":X,"endIndex":X+2,"tabId":"<tab_id>"}}}]}'
```

### Limitation: Tab Renaming

Tab renaming is NOT supported via the batchUpdate API. Must be done manually in Google Docs UI.

## Common Operations

### Read a Document

```bash
# Use MCP tool for simple (non-tabbed) documents
google-docs__readDocument documentId="<doc-id>" format="text"

# Use direct API for tabbed documents
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID?includeTabsContent=true" \
  | jq '.tabs[] | select(.tabProperties.tabId == "<tab_id>") | .documentTab.body.content'
```

### Replace All Wiki-Style Links

Wiki-style links like `[[TARGET|DISPLAY]]` or `[[TARGET]]` are not supported in Google Docs. Replace them with plain text:

```bash
# Use findAndReplace API
curl -s -X POST -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID:batchUpdate" \
  -d '{"requests":[{"replaceAllText":{"containsText":{"text":"[[TARGET|DISPLAY]]","matchCase":true},"replaceText":"DISPLAY"}}]}'
```

### Sync Markdown to Google Docs

1. Delete existing content from tab
2. Insert new markdown content as plain text
3. Apply heading styles (`HEADING_1` through `HEADING_6`)
4. Remove `#` markers from headings
5. Replace wiki-style links with plain text
6. Remove markdown formatting (`**bold**`, `*italic*`, `---`)

See `scripts/sync_to_tab.py` for a complete implementation.

## Configuration

**Token file:** `~/.config/google-docs-mcp/token.json` (mode 600)

**Secrets:** `~/.openclaw/secrets/google-docs-mcp.env` (mode 600)

**Required environment variables:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Resources

- **GitHub:** https://github.com/a-bonus/google-docs-mcp
- **NPM:** https://www.npmjs.com/package/@a-bonus/google-docs-mcp
- **Issues:** https://github.com/a-bonus/google-docs-mcp/issues (report tab bug here)
