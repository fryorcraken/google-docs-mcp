# Docs

Tools for interacting with the Google Docs API. Covers reading and writing document content, text and paragraph formatting, structural elements like tables and images, and comment management.

## Structure

```
docs/
├── index.ts            # Router — registers top-level tools and delegates to sub-domains
├── comments/           # Comment management sub-domain
│   └── index.ts        # Router for comment tools
├── formatting/         # Text and paragraph formatting sub-domain
│   └── index.ts        # Router for formatting tools
└── (top-level tools)   # Core read/write and structure tools
```

## Core Read/Write

| Tool           | Description                                               |
| -------------- | --------------------------------------------------------- |
| `readDocument` | Reads document content as plain text, markdown, or JSON   |
| `listTabs`     | Lists all tabs in a document with their IDs and hierarchy |
| `appendText`   | Appends plain text to the end of a document               |
| `insertText`   | Inserts text at a specific character index                |
| `deleteRange`  | Deletes content within a character range                  |

## Structure

| Tool                    | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `insertTable`           | Inserts an empty table at a character index                                                                  |
| `insertDateChip`        | Inserts a real Google Docs date smart chip at a character index                                              |
| `insertPerson`          | Inserts a Google Docs person smart chip using an email address                                               |
| `insertRichLink`        | Inserts a Google Docs rich-link smart chip for a Google resource                                             |
| `listSmartChips`        | Lists date, person, and rich-link smart chips found in the document                                          |
| `cloneTable`            | Clones a source table into a target document while preserving widths and table-level styling where supported |
| `listDocumentTables`    | Lists tables in a document with MCP table IDs                                                                |
| `getTableStructure`     | Returns row/column/cell structure for a table                                                                |
| `findSectionsByHeading` | Finds heading sections and the table that follows them                                                       |
| `replaceTableRowData`   | Replaces the contents of an existing table row                                                               |
| `appendTableRows`       | Appends rows to an existing table without replacing the whole document                                       |
| `deleteTableRows`       | Deletes one or more rows from an existing table                                                              |
| `insertPageBreak`       | Inserts a page break at a character index                                                                    |
| `insertSectionBreak`    | Inserts a section break (NEXT_PAGE or CONTINUOUS) — required before changing page style                      |
| `updateSectionStyle`    | Updates section style: flip page orientation (landscape), margins, page numbering, etc.                      |
| `insertImage`           | Inserts an image from a URL or local file path                                                               |

## [Formatting](./formatting/)

| Tool                     | Description                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `applyTextStyle`         | Applies character-level formatting (bold, color, font, etc.) to a range or found text |
| `applyParagraphStyle`    | Applies paragraph-level formatting (alignment, spacing, heading styles)               |
| `updateTableCellStyle`   | Applies background, padding, and alignment to a table cell range                      |
| `updateTableBorders`     | Applies border styles to a table cell range                                           |
| `updateTableColumnWidth` | Sets fixed widths for one or more table columns                                       |
| `updateTableRowStyle`    | Applies row-level styling and optional pinned header rows                             |

## [Comments](./comments/)

| Tool             | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `listComments`   | Lists all comments with IDs, authors, status, and quoted text |
| `getComment`     | Gets a specific comment and its full reply thread             |
| `addComment`     | Adds a comment at a specific text range                       |
| `replyToComment` | Adds a reply to an existing comment thread                    |
| `resolveComment` | Marks a comment as resolved                                   |
| `deleteComment`  | Permanently deletes a comment and all its replies             |
