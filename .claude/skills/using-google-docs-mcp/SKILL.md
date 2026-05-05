---
name: using-google-docs-mcp
description: Pick the right tool from @fryorcraken/google-docs-mcp and call it with the right parameters. Covers Google Docs (read/write/format/tabs/comments/markdown sync), Google Sheets (read/write/format/tables/charts), Google Drive (search/create/move/copy), Gmail (read/send/draft), Google Calendar (read/CRUD events). Use when the user asks Claude to "read a Google Doc", "update a sheet", "send an email", "find files in Drive", "schedule a meeting", or any operation against Google Workspace via this MCP server. Includes the tab-aware parameter pattern and known limitations.
---

# Using @fryorcraken/google-docs-mcp

Practical guide for picking and calling tools from this MCP server. Assumes the server is already installed and authorized — see the `setup-google-docs-mcp` skill if not.

## Picking a tool

| You want to...                               | Use                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Read a Google Doc as text                    | `readDocument` (`format: 'text'`)                                     |
| Read a Google Doc as markdown for editing    | `readDocument` (`format: 'markdown'`)                                 |
| Inspect a doc's raw structure (find indices) | `readDocument` (`format: 'json'`)                                     |
| Replace entire doc content from markdown     | `replaceDocumentWithMarkdown`                                         |
| Append markdown to a doc                     | `appendMarkdownToGoogleDoc`                                           |
| Insert plain text at a specific index        | `insertText`                                                          |
| Insert a table                               | `insertTable` (empty) or `insertTableWithData` (pre-filled)           |
| Replace a single row's contents              | `replaceTableRowData`                                                 |
| Find or replace text                         | `findAndReplace` (simple) or `modifyText` (combined replace+style)    |
| Apply text formatting                        | `applyTextStyle`                                                      |
| Apply paragraph formatting                   | `applyParagraphStyle`                                                 |
| Insert images                                | `insertImage` (URL or local path)                                     |
| Insert a date/person/link chip               | `insertDateChip` / `insertPerson` / `insertRichLink`                  |
| Comment workflow                             | `listComments`, `addComment`, `replyToComment`, `resolveComment`      |
| Read/write a spreadsheet range               | `readSpreadsheet`, `writeSpreadsheet`                                 |
| Append rows                                  | `appendRows`                                                          |
| Format cells                                 | `formatCells`, `setCellBorders`, `setColumnWidths`                    |
| Charts and conditional formatting            | `insertChart`, `addConditionalFormatting`                             |
| Find Google Docs/files                       | `listGoogleDocs`, `searchGoogleDocs`, `searchDriveFiles`              |
| Move/copy/create files                       | `moveFile`, `copyFile`, `createFolder`, `createDocument`              |
| Read/send Gmail                              | `listMessages`, `getMessage`, `sendEmail`, `createDraft`, `sendDraft` |
| Calendar events                              | `listEvents`, `createEvent`, `updateEvent`, `quickAddEvent`           |

Full catalog with parameter details: `docs/TOOLS.md` in the repo.

## Mandatory: tab-aware parameters

Google Docs tabs (introduced 2024) put content under `documentTab` instead of the legacy `body`. **Every position-taking tool accepts an optional `tabId`** parameter:

- **Omit `tabId`**: the server auto-detects tabbed docs and operates on the **first tab**. For non-tabbed docs, uses the legacy body. This is the safe default when you don't know the doc's structure.
- **Pass `tabId` explicitly**: required when you need a specific tab. Get IDs from `listTabs`.
- **Wrong `tabId`**: throws a clear error listing available tab IDs. No silent failures.

Indices reported by `readDocument` (`format: 'json'`) are scoped to the tab that was read — don't mix indices across tabs.

```
1. listTabs to discover tab IDs
2. readDocument with format='json' and tabId=<target> to find indices
3. insertText / deleteRange / etc. with the same tabId to operate
```

## Common workflows

### Markdown round-trip (edit a Doc as markdown)

```
readDocument(documentId, format='markdown', tabId=<optional>)
  → edit the markdown text locally
  → replaceDocumentWithMarkdown(documentId, markdown=<edited>, tabId=<same>)
```

Notes:

- The markdown transformer supports headings, bold/italic/strikethrough, links, bullet/numbered lists, code blocks (rendered as styled 1×1 tables matching Docs' Code Block building block), inline code (monospace + tinted background).
- `firstHeadingAsTitle: true` makes the first `# H1` render as a Docs **Title** style instead of Heading 1.
- **Not supported in markdown→Docs**: tables, images, complex 3+ level nested lists.
- Practical size cap: ~10,000 words per document due to batch limits.

### Append to a Doc (preserves existing content)

```
appendMarkdownToGoogleDoc(documentId, markdown, tabId=<optional>)
  - addNewlineIfNeeded: true (default) inserts spacing before
  - firstHeadingAsTitle: false (default)
```

### Find by index without `format='json'`

`getTableStructure`, `findSectionsByHeading`, `listSmartChips`, `listDocumentTables` — all return start/end indices for specific element types without the cost of a full JSON dump.

### Send a styled email

```
sendEmail({ to, subject, body, cc?, bcc? })
```

`body` is **plain text only**. HTML is delivered as literal text — no rich formatting via this tool. Use a draft + manual edit if you need HTML.

### Create + share a doc

```
createDocument(title)
  → returns documentId
  → use other tools to write content
  → moveFile(fileId, parentFolderId) to organize
```

Sharing/permissions tools aren't exposed — manage via the Drive UI or add the recipient via Drive directly.

## Indices, ranges, and units

- **Indices**: 1-based. Index 0 is the document's leading section break and can't be modified.
- **Ranges**: `[startIndex, endIndex)` — end is exclusive.
- **Colors**: hex `#RRGGBB` or `#RGB`. Server validates; bad hex throws.
- **Alignment values**: `START`, `END`, `CENTER`, `JUSTIFIED`. **Not** `LEFT`/`RIGHT` — they refer to logical direction in the language's writing system.
- **Spreadsheet ranges**: A1 notation (`Sheet1!A1:C10` or `A1:C10` if only one sheet).

## Known limitations

- **Comment anchoring**: programmatically created comments appear in "All Comments" but aren't visibly anchored to text in the UI. Drive API limitation.
- **Resolved comment status**: may not persist in the Docs UI (Drive API quirk).
- **Gmail hard delete**: `trashMessage` only moves to Trash. Permanent deletion needs the full `mail.google.com` scope, which this server doesn't request.
- **Gmail attachments**: `getMessage` returns metadata only — no attachment download.
- **Calendar scope**: `calendar.events` covers event CRUD only, not creating/deleting whole calendars.
- **Recurring events**: `updateEvent`/`deleteEvent` operate on the entire series unless given a specific instance ID from `listEvents` with `singleEvents: true`.
- **`fixListFormatting`**: experimental, may not work reliably.
- **Code blocks in markdown**: rendered as 1×1 tables. They look right in Docs but aren't real "code blocks" the API can later detect.

## Error handling cues

- **`Document not found`** → check the document ID (the long string between `/d/` and `/edit` in the URL).
- **`Permission denied`** → the authorized user doesn't have access. Ask the user to share the doc with the OAuth account, or check Workspace admin restrictions on the Docs API. The server transparently falls back to Drive `files.export` for plain-text reads on 403 — markdown/json reads will surface the error.
- **`Tab "X" not found in document`** → either the tabId is stale or wrong. Call `listTabs` to get the current list.
- **`Invalid request sent to Google Docs API`** → the `details` field of the error usually pinpoints which request in a batch failed. For batch operations, the entire batch fails atomically.

## For openclaw users

This skill is portable. To make it available to an openclaw agent:

```bash
# Symlink into the agent's workspace
ln -s /path/to/google-docs-mcp/.claude/skills/using-google-docs-mcp \
      ~/.openclaw/workspace/<agent>/.claude/skills/

# OR copy globally (visible to all agents on the host)
cp -r /path/to/google-docs-mcp/.claude/skills/using-google-docs-mcp \
      ~/.claude/skills/
```

The agent will discover it via standard `.claude/skills/` lookup.

## Resources

- **Tool catalog with full parameter details**: `docs/TOOLS.md` in the repo
- **Source-of-truth tool definitions**: `src/tools/<domain>/<toolName>.ts` (each tool's Zod schema is its API contract)
- **Repo**: https://github.com/fryorcraken/google-docs-mcp
- **Issues**: https://github.com/fryorcraken/google-docs-mcp/issues
