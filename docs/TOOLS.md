# Google Docs MCP Server

FastMCP server with ~128 tools for Google Docs, Sheets, Slides, Drive, Gmail, and Calendar.

## Context Budget — Lazy Mode

By default, every session loads ~32k tokens of tool definitions just to advertise the catalog. Set `MCP_LAZY_TOOLS=1` to drop that to ~500 tokens — the server then exposes only three meta-tools:

- **`searchTools({query?, domain?, limit?})`** — find tools by keyword or domain (`docs`, `sheets`, `drive`, `gmail`, `calendar`, `slides`, `utils`). Returns `name`, `domain`, and a one-line description per match.
- **`describeTool({name})`** — full description + JSON schema for one tool.
- **`callTool({name, args})`** — invoke a tool. Args are Zod-validated before the tool runs.

Tradeoff: one extra round-trip per new capability the agent uses (search → describe → call), versus a much smaller passive context. Agents that touch many tools per session may prefer eager mode. Lazy mode is opt-in; default behavior is unchanged.

## Edit-in-Place Verb Map

For agents asking "how do I edit this Google Doc in place?":

| Action                                              | Tool(s)                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Insert text/structure at an index                   | `insertText`, `insertTable`, `insertPageBreak`, `insertSectionBreak`, `insertImage*`                   |
| **Insert markdown-formatted content**               | **`insertMarkdown`** (by index, or anchored to text with `before`/`after`)                             |
| Delete a range                                      | `deleteRange`                                                                                          |
| **Delete an entire paragraph by text anchor**       | **`deleteParagraphContaining`** (resolves paragraph from current state, no index math)                 |
| **Get a paragraph's range without reading the doc** | **`findParagraphRange`** (by `textToFind` or `indexWithinParagraph`)                                   |
| Find and replace text (no formatting)               | `findAndReplace`, `modifyText`                                                                         |
| **Replace a range with markdown formatting**        | **`replaceRangeWithMarkdown`** (range or `textToFind` targeting)                                       |
| Restyle a range                                     | `applyTextStyle`, `applyParagraphStyle`, `formatMatchingText`                                          |
| **Link text to a heading (same or another tab)**    | **`listHeadings`** to get `headingId`, then `applyTextStyle`/`modifyText` with `style.linkHeading`     |
| **Add/remove bullets**                              | **`updateParagraphBullets`** (`action: 'remove' \| 'set'` with `bulletPreset` for `'set'`)             |
| **Unbullet a paragraph (one-shot)**                 | **`unbulletParagraph`** — optional prefix-strip + bullet removal + namedStyleType + inline-style clear |
| **Add an item to an existing custom-glyph list**    | **`addListItem`** (insert after a donor paragraph already in the desired list)                         |
| Replace whole doc with markdown                     | `replaceDocumentWithMarkdown`                                                                          |
| Append                                              | `appendToGoogleDoc`, `appendMarkdownToGoogleDoc`                                                       |
| Edit table contents                                 | `editTableCell`, `replaceTableRowData`, `appendDocTableRows`, `deleteTableRows`                        |
| Manage comments                                     | `addComment`, `replyToComment`, `resolveComment`, `deleteComment`                                      |

Canonical workflow: `readDocument` with `format='json'` → find indices → call the right verb. Use `format='markdown'` first if you need to inspect the content human-readably.

## Tool Categories

| Category      | Count | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docs          | 5     | `readGoogleDoc`, `appendToGoogleDoc`, `insertText`, `deleteRange`, `listDocumentTabs`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Markdown      | 2     | `replaceDocumentWithMarkdown`, `appendMarkdownToGoogleDoc`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Formatting    | 3     | `applyTextStyle`, `applyParagraphStyle`, `formatMatchingText`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Structure     | 9     | `insertTable`, `insertPageBreak`, `insertSectionBreak`, `updateSectionStyle`, `insertImageFromUrl`, `insertLocalImage`, `editTableCell`_, `findElement`_, `fixListFormatting`\*                                                                                                                                                                                                                                                                                                                        |
| Comments      | 6     | `listComments`, `getComment`, `addComment`, `replyToComment`, `resolveComment`, `deleteComment`                                                                                                                                                                                                                                                                                                                                                                                                        |
| Sheets        | 31    | `readSpreadsheet`, `writeSpreadsheet`, `appendRows`, `clearRange`, `batchWrite`, `createSpreadsheet`, `listSpreadsheets`, `duplicateSheet`, `copySheetTo`, `renameSheet`, `deleteSheet`, `formatCells`, `setCellBorders`, `autoResizeColumns`, `autoResizeRows`, `setColumnWidths`, `setRowHeights`, `freezeRowsAndColumns`, `groupRows`, `protectRange`, `addConditionalFormatting`, `getConditionalFormatting`, `deleteConditionalFormatting`, `setDropdownValidation`, `insertChart`, `deleteChart` |
| Sheets Tables | 6     | `createTable`, `listTables`, `getTable`, `deleteTable`, `updateTableRange`, `appendTableRows`                                                                                                                                                                                                                                                                                                                                                                                                          |
| Drive         | 13    | `listGoogleDocs`, `searchGoogleDocs`, `getDocumentInfo`, `createFolder`, `moveFile`, `copyFile`, `createDocument`                                                                                                                                                                                                                                                                                                                                                                                      |
| Gmail         | 13    | `listMessages`, `getMessage`, `sendEmail`, `trashMessage`, `modifyMessageLabels`, `listLabels`, `createDraft`, `listDrafts`, `getDraft`, `updateDraft`, `sendDraft`, `deleteDraft`, `triageInbox`                                                                                                                                                                                                                                                                                                      |
| Calendar      | 5     | `listEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `quickAddEvent`                                                                                                                                                                                                                                                                                                                                                                                                                             |

\*Not fully implemented

## Shared Drives Support

The server supports Google Shared Drives. All Drive file operations (`files.list`, `files.get`, `files.create`, `files.update`, `files.copy`, `files.delete`, `permissions.create`) use `supportsAllDrives: true` and `includeItemsFromAllDrives: true` (for list operations), enabling agents to query, create, and update documents in shared drives.

## Known Limitations

- **Comment anchoring:** Programmatically created comments appear in "All Comments" but aren't visibly anchored to text in the UI
- **Resolved status:** May not persist in Google Docs UI (Drive API limitation)
- **fixListFormatting:** Experimental, may not work reliably
- **Gmail hard delete:** `trashMessage` only moves to Trash (reversible). Permanent deletion requires the full `https://mail.google.com/` scope, which is not requested.
- **Gmail attachments:** `getMessage` exposes attachment metadata only — no download of attachment bytes yet.
- **Gmail send format:** `sendEmail` is plain-text only. HTML bodies are delivered as literal text.
- **Calendar scope:** `calendar.events` covers event CRUD only. Cannot create or delete entire calendars.
- **Calendar recurring events:** `updateEvent` and `deleteEvent` operate on the entire series unless you target a specific instance ID from `listEvents` with `singleEvents=true`.

## Parameter Patterns

- **Document ID:** Extract from URL: `docs.google.com/document/d/DOCUMENT_ID/edit`
- **Text targeting:** Use `textToFind` + `matchInstance` OR `startIndex`/`endIndex`
- **Colors:** Hex format `#RRGGBB` or `#RGB`
- **Alignment:** `START`, `END`, `CENTER`, `JUSTIFIED` (not LEFT/RIGHT)
- **Indices:** 1-based, ranges are [start, end)
- **Tabs:** Optional `tabId` parameter (defaults to first tab)

## Markdown Support

### Workflow

1. **Retrieve**: Use `readGoogleDoc` with `format='markdown'` to get document content as markdown
2. **Edit**: Modify markdown locally using your preferred editor
3. **Apply**: Use `replaceDocumentWithMarkdown` or `appendMarkdownToGoogleDoc` to write changes back

### Supported Markdown Features

- **Headings**: `# H1` through `###### H6`
- **Bold**: `**bold**` or `__bold__`
- **Italic**: `*italic*` or `_italic_`
- **Strikethrough**: `~~strikethrough~~`
- **Links**: `[text](url)`
- **Lists**: Bullet (`-`, `*`) and numbered (`1.`, `2.`)
- **Code blocks**: Fenced code blocks (` ``` `) rendered as styled 1x1 tables (matching Google Docs' native Code Block building block)
- **Inline code**: Backtick code rendered with monospace font + green color + gray background
- **Nested formatting**: `***bold italic***`, `**bold [link](url)**`

### Markdown Tools

#### `replaceDocumentWithMarkdown`

Replaces entire document content with markdown-formatted content.

**Parameters:**

- `documentId`: The document ID
- `markdown`: The markdown content to apply
- `preserveTitle` (optional): If true, preserves the first heading/title
- `firstHeadingAsTitle` (optional, default: false): If true, the first `# H1` is styled as a Google Docs **Title** instead of Heading 1
- `tabId` (optional): Target a specific tab

**Example:**

```markdown
# My Document

This is **bold** text with a [link](https://example.com).

- List item 1
- List item 2
  - Nested item

## Section 2

More content with _italic_ and ~~strikethrough~~.
```

#### `replaceRangeWithMarkdown`

Replaces a character range with markdown-formatted content. Use this for in-place section edits (heading-scoped, paragraph-scoped, or arbitrary range) without rewriting the entire document.

**Parameters:**

- `documentId`: The document ID
- `markdown`: The markdown content to insert in place of the range
- Either `startIndex` + `endIndex` (1-based, half-open `[start, end)`) **or** `textToFind` + optional `matchInstance` (1-based, defaults to 1). Provide exactly one of the two targeting modes.
- `tabId` (optional): Target a specific tab. Auto-detects on tabbed docs if omitted.
- `firstHeadingAsTitle` (optional, default: false): If true, the first `# H1` is styled as a Google Docs **Title** instead of Heading 1.

**Notes:**

- Paragraph properties (heading level, list membership) at `startIndex` are inherited by the inserted content. For clean structural changes (e.g. heading → normal text), prefer `replaceDocumentWithMarkdown`.
- Use `readDocument` with `format='json'` to find indices, or `format='markdown'` to inspect content before targeting.

#### `appendMarkdownToGoogleDoc`

Appends markdown content to the end of a document with full formatting.

**Parameters:**

- `documentId`: The document ID
- `markdown`: The markdown content to append
- `addNewlineIfNeeded` (optional, default: true): Add spacing before appended content
- `firstHeadingAsTitle` (optional, default: false): If true, the first `# H1` is styled as a Google Docs **Title** instead of Heading 1
- `tabId` (optional): Target a specific tab

#### `insertMarkdown`

Inserts markdown-formatted content at a chosen position in a document. Use this when you need to insert a new section (with its own heading, lists, etc.) mid-document — `appendMarkdown` only writes at the end, and `findAndReplace` can't introduce new paragraph styling.

**Parameters:**

- `documentId`: The document ID
- `markdown`: The markdown content to insert
- `target`: Either `{ index }` for a direct character index, or `{ textToFind, position }` where `position` is `'before'` or `'after'` an existing piece of text. Use `position: 'before'` against the first text of the next paragraph to insert a brand-new paragraph between two existing ones.
- `tabId` (optional): Target a specific tab; defaults to the first tab on tabbed docs
- `firstHeadingAsTitle` (optional, default: false): Style the first `# H1` as Google Docs **Title**

#### `updateParagraphBullets`

Adds, removes, or changes paragraph bullets/numbering. The canonical fix for "I have a heading or paragraph that accidentally inherited a bullet from its neighbour and I can't get rid of it" — `applyParagraphStyle` doesn't touch the `bullet` attribute, so this tool is the only way (short of UI editing) to clear it.

**Parameters:**

- `documentId`: The document ID
- `action`: `'remove'` to clear the bullet attribute on the targeted paragraphs, or `'set'` to apply a bullet/numbering preset
- `bulletPreset` (required when `action='set'`): One of the Google Docs BulletGlyphPreset values, e.g. `BULLET_DISC_CIRCLE_SQUARE` (filled-disc bullets) or `NUMBERED_DECIMAL_ALPHA_ROMAN` (ordered numbering)
- `target`: One of `{ startIndex, endIndex }`, `{ textToFind, matchInstance? }`, or `{ indexWithinParagraph }`. Text and index targets snap to the containing paragraph automatically.
- `tabId` (optional): Target a specific tab

**Limitation — custom-glyph lists:** `action='set'` always creates a fresh list from a built-in preset. It cannot attach a paragraph to a specific existing list (e.g. one with a literal `-` glyph imported from Word). The Google Docs API does not expose paragraph-to-list assignment at all; the only mechanism that works is the inheritance trick, which lives in [`addListItem`](#addlistitem).

#### `addListItem`

Adds a new list item immediately after an existing list item (the **donor**). The new item inherits the donor's bullet — including custom glyphs that no preset reproduces. This is the only way to add an item to a custom-glyph list via the Docs API.

**Parameters:**

- `documentId`: The document ID
- `donor`: A paragraph already in the desired list. Provide either `{ textToFind, matchInstance? }` or `{ indexWithinDonor }`. The new item lands directly after this paragraph.
- `text`: The text content for the new item (no bullet markers — the bullet is inherited).
- `tabId` (optional): Target a specific tab

**How it works:** the Docs API has no operation that says "attach this paragraph to listId X". It does have one well-defined inheritance rule: inserting a `\n` mid-paragraph creates a new paragraph whose style is copied from the original, including its `bullet.listId` and `bullet.nestingLevel`. This tool exploits that rule by inserting `\n<text>` just before the donor's trailing newline.

**Constraint:** the new item is always placed directly after the donor. To insert into the middle of a list, pick the donor item that the new one should follow. To replace an existing paragraph's bullet, add a new sibling item via this tool and delete the old paragraph with `deleteRange`.

### Known Limitations for Markdown

- Tables not yet supported in markdown-to-docs conversion
- Images not yet supported in markdown-to-docs conversion
- Complex nested lists (3+ levels) may have formatting quirks
- Maximum practical document size: ~10,000 words (due to Google Docs API batch limits)

## Source Files (for implementation details)

| File                                         | Contains                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/types.ts`                               | Zod schemas, hex color validation, style parameter definitions                                   |
| `src/googleDocsApiHelpers.ts`                | `findTextRange`, `executeBatchUpdate`, `executeBatchUpdateWithSplitting`, style request builders |
| `src/googleSheetsApiHelpers.ts`              | A1 notation parsing, range/format operations, protected-range helpers, table helpers             |
| `src/markdown-transformer/markdownToDocs.ts` | Markdown-to-Google-Docs conversion logic                                                         |
| `src/markdown-transformer/docsToMarkdown.ts` | Google-Docs-to-Markdown conversion logic                                                         |
| `src/markdown-transformer/index.ts`          | Markdown-it configuration and public API                                                         |
| `src/index.ts`                               | Entry point, CLI handling, and MCP server startup                                                |

## See Also

- `README.md` - Setup instructions and usage examples
- `SAMPLE_TASKS.md` - 15 example workflows
