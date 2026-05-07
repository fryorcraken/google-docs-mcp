---
name: using-google-docs-mcp
description: Pick the right tool from @fryorcraken/google-docs-mcp for Google Workspace operations (Docs, Sheets, Drive, Gmail, Calendar). Use for "read a Google Doc", "update a sheet", "send an email", "find files in Drive", "schedule a meeting".
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
| Append markdown to a doc                     | `appendMarkdown`                                                      |
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
| Find Google Docs/files                       | `listDocuments`, `searchDocuments`, `searchDriveFiles`                |
| Move/copy/create files                       | `moveFile`, `copyFile`, `createFolder`, `createDocument`              |
| Read/send Gmail                              | `listMessages`, `getMessage`, `sendEmail`, `createDraft`, `sendDraft` |
| Calendar events                              | `listEvents`, `createEvent`, `updateEvent`, `quickAddEvent`           |
| Slides — read/list                           | `readPresentation`, `listSlides`                                      |
| Slides — create new presentation             | `createPresentation`                                                  |
| Slides — add/delete/duplicate/move slides    | `addSlide`, `deleteSlide`, `duplicateSlide`, `moveSlide`              |
| Slides — replace placeholder text everywhere | `replaceAllText`                                                      |
| Slides — insert text into a shape            | `insertSlideText`                                                     |
| Slides — style text on a slide               | `applySlideTextStyle`                                                 |
| Slides — insert image from URL               | `insertSlideImage`                                                    |

Full catalog with parameter details: `docs/TOOLS.md` in the repo.

> 📛 **Tool name vs file name.** Some tools have file names that differ from their registered names. The authoritative tool name is the `name:` field in `server.addTool({ ... })`, NOT the filename. Examples: `src/tools/drive/listGoogleDocs.ts` registers as `listDocuments`; `searchGoogleDocs.ts` as `searchDocuments`; `appendMarkdownToGoogleDoc.ts` as `appendMarkdown`. If a tool call returns "tool not found", grep for `name: '` in the source file to confirm — don't trust the filename.

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
appendMarkdown(documentId, markdown, tabId=<optional>)
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

### Slides: template-driven deck (placeholder swap pattern)

The most reliable way to build a Slides deck programmatically is to start from an existing template with placeholder tokens (`{{NAME}}`, `{{DATE}}`, etc.) and swap them via `replaceAllText`. This avoids the friction of computing shape objectIds.

```
1. Copy a template deck via Drive's copyFile, OR createPresentation(title)
2. (Optional) addSlide(...) for any new slides beyond the template
3. replaceAllText(presentationId, findText='{{NAME}}', replaceText='Alice')
   — repeat per placeholder. occurrencesChanged tells you how many were swapped.
4. (Optional) insertSlideImage(...) for charts or photos
```

For more granular control (insert text at a specific position, apply per-character formatting):

```
1. readPresentation(presentationId, format='json') to find shape objectIds
2. insertSlideText(presentationId, shapeObjectId, text)
3. applySlideTextStyle(presentationId, shapeObjectId, textRange={start, end}, style={...})
```

Notes for Slides:

- **Slide layouts** in `addSlide`: `BLANK`, `TITLE`, `TITLE_AND_BODY` (default), `TITLE_AND_TWO_COLUMNS`, `TITLE_ONLY`, `SECTION_HEADER`, etc.
- **Image insertion** requires a public URL reachable by Google. For local files, upload to Drive first (use `createDocument`/`copyFile` then share publicly) and pass the resulting URL.
- **Text indices** in slides are 0-based and per-shape (different from Docs which uses 1-based document-wide indices).
- **Speaker notes** are not included in `readPresentation` text output — use `format='json'` and inspect `slide.notesPage` if needed.

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
