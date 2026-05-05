# Google Docs MCP Spec: Rich Planning Document Formatting

**Status**: Draft  
**Owner**: TBD  
**Last Updated**: 2026-04-27  
**Target Repo**: `google-docs-mcp`

## 1. Problem

The current Google Docs MCP server can update document text, apply character-level text styles, and insert tables. That is enough for plain document editing, but it is not enough for structured planning documents that rely on rich Google Docs formatting.

The concrete failure mode is planning documents like:

- clickable date/time chips at the top of the document
- visually distinct title chips or chip-like metadata blocks
- tables with colored header rows
- controlled column widths and row heights
- structured multi-line content inside a single table cell
- copying an existing table template and replacing only the task data
- patching content while preserving document-specific rich formatting

Today, when the MCP server replaces content via Markdown:

- smart chips degrade into plain text
- table header background colors are lost
- cell spacing and layout are lost
- multi-line memo content becomes ugly or breaks table structure
- links may be reintroduced, but the final result is still far from the expected visual output

## 2. Goal

Enable `google-docs-mcp` to create and update planning documents so they remain visually close to manually curated Google Docs templates.

The server should support a workflow where an agent can:

1. locate a preformatted planning template or an existing planning document
2. identify rich blocks such as title area and task tables
3. replace only the sprint-specific data
4. preserve styling, spacing, smart chips, and table layout
5. verify that the output is structurally correct

## 3. Non-Goals

- Full WYSIWYG layout editing for every Google Docs feature
- Pixel-perfect browser automation as the primary implementation path
- Solving arbitrary desktop publishing use cases
- Replicating all Google Docs UI interactions in MCP

This spec focuses on the minimum rich formatting capabilities needed for planning documents.

## 4. Primary Use Case

### 4.1 Input

A user provides:

- a target planning document
- a source sprint or milestone task list
- optionally an old planning document that already has the desired format

### 4.2 Expected Output

The target document should have:

- top metadata line rendered as a clickable date chip where appropriate
- preserved title appearance
- preserved heading structure
- preserved task tables with header shading and borders
- preserved table layout
- sprint task rows updated with new content
- memo cells containing readable sub-sections such as:
  - `影響箇所`
  - `対応方針`
  - `想定成果物`

## 5. Current Capability Gap

Current repo capabilities:

- `readDocument`
- `replaceDocumentWithMarkdown`
- `replaceRangeWithMarkdown`
- `applyTextStyle`
- `insertTableWithData`
- document text insertion/deletion helpers

Missing capabilities:

- smart chip creation and reading
- table-level cell styling
- table border styling
- column width and row height control
- structured rich text inside a table cell
- template table cloning
- row-level data replacement without losing formatting
- discovery APIs for finding tables and sections
- verification APIs for structural validation

## 6. Product Requirements

### 6.1 Smart Chips

The MCP server must support reading and inserting smart chips for planning doc metadata.

Required chip types:

- date chip
- person chip
- file chip
- rich link chip

Minimum required for this planning-doc feature:

- date chip

### 6.2 Table Formatting

The MCP server must support formatting Google Docs tables at cell, row, column, and table range levels.

Required formatting controls:

- background color
- text alignment
- vertical alignment
- padding
- row minimum height
- column width
- border style
- border width
- border color

### 6.3 Structured Cell Content

The MCP server must support rendering multi-line rich content inside a single table cell without breaking the table.

Required content patterns:

- bold labels followed by body text
- bullet list sections
- multiple paragraphs in one cell
- links inside cell content

### 6.4 Template-Preserving Updates

The MCP server must support copying an existing formatted table or updating rows inside that table without destroying the format.

Required behaviors:

- clone a table from an existing doc or from another location in the same doc
- replace row contents only
- append and delete rows while preserving styling
- preserve header row styling

### 6.5 Section-Level Patching

The MCP server must support replacing content inside a named section without touching unrelated rich formatting elsewhere in the document.

Required section anchors:

- heading-based selection
- table-based selection
- range-based fallback

### 6.6 Verification

The MCP server must support structural verification so an agent can confirm whether the document matches the intended output.

Required checks:

- section exists
- table exists with expected dimensions
- header row style present
- link fields present where expected
- smart chip exists where expected

## 7. Proposed MCP Tool Additions

This section defines proposed tools or helper-level capabilities. Final naming can change, but the functional coverage should remain.

### 7.1 Smart Chip Tools

#### `insertDateChip`

Insert a date chip at a document position.

```ts
{
  documentId: string;
  tabId?: string;
  index: number;
  date: string; // ISO-like date or date-time
  timezone?: string;
  displayFormat?: "DATE" | "DATE_TIME";
}
```

#### `listSmartChips`

Read smart chips from a document or range.

```ts
{
  documentId: string;
  tabId?: string;
  startIndex?: number;
  endIndex?: number;
}
```

Response should include:

- chip type
- display text
- range
- backing metadata

### 7.2 Table Discovery Tools

#### `listDocumentTables`

Return all tables in a document with identifiers and structure.

```ts
{
  documentId: string;
  tabId?: string;
}
```

Response should include:

- `tableId`
- `startIndex`
- `endIndex`
- `rowCount`
- `columnCount`
- optional header-row detection

#### `getTableStructure`

Return detailed cell map for a single table.

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
}
```

### 7.3 Table Styling Tools

#### `updateTableCellStyle`

Apply style to one or more cells.

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
  range: {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
  };
  style: {
    backgroundColor?: string;
    contentAlignment?: "START" | "CENTER" | "END";
    verticalAlignment?: "TOP" | "MIDDLE" | "BOTTOM";
    paddingTopPt?: number;
    paddingBottomPt?: number;
    paddingLeftPt?: number;
    paddingRightPt?: number;
  };
}
```

#### `updateTableBorders`

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
  range?: {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
  };
  borders: {
    top?: BorderStyle;
    right?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
    innerHorizontal?: BorderStyle;
    innerVertical?: BorderStyle;
  };
}

type BorderStyle = {
  color?: string;
  widthPt?: number;
  dashStyle?: "SOLID" | "DOTTED" | "DASHED";
};
```

#### `updateTableColumnWidth`

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
  columnIndex: number;
  widthPt: number;
}
```

#### `updateTableRowStyle`

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
  rowIndex: number;
  minHeightPt?: number;
  repeatAsHeaderRow?: boolean;
}
```

### 7.4 Template / Clone Tools

#### `cloneTable`

Clone an existing table within the same document or from another document.

```ts
{
  sourceDocumentId: string;
  sourceTabId?: string;
  sourceTableId: string;
  targetDocumentId: string;
  targetTabId?: string;
  insertIndex: number;
}
```

This is the most important capability for planning-doc preservation.

### 7.5 Row Data Operations

#### `replaceTableRowData`

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
  rowIndex: number;
  values: Array<RichCellContent>;
}
```

#### `appendTableRows`

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
  rows: Array<Array<RichCellContent>>;
  copyStyleFromRowIndex?: number;
}
```

#### `deleteTableRows`

```ts
{
  documentId: string;
  tabId?: string;
  tableId: string;
  rowStart: number;
  rowCount: number;
}
```

### 7.6 Rich Cell Content

#### `RichCellContent`

The current Markdown table approach is too weak for planning-doc cells. We need a structured content model.

```ts
type RichCellContent = {
  blocks: Array<
    | {
        type: 'paragraph';
        runs: TextRun[];
      }
    | {
        type: 'bulletedList';
        items: Array<{ runs: TextRun[] }>;
      }
    | {
        type: 'numberedList';
        items: Array<{ runs: TextRun[] }>;
      }
  >;
};

type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  foregroundColor?: string;
  linkUrl?: string;
};
```

This model is enough to represent:

- `影響箇所` as bold paragraph
- a bullet list of impacted screens
- `対応方針` as bold paragraph
- a bullet list of implementation steps
- `想定成果物` as bold paragraph
- a bullet list of PR / tests / evidence

### 7.7 Section Discovery and Patching

#### `findSectionsByHeading`

```ts
{
  documentId: string;
  tabId?: string;
  headings: string[];
}
```

#### `replaceSectionContent`

```ts
{
  documentId: string;
  tabId?: string;
  sectionHeading: string;
  content: SectionContent;
  preserveSectionHeading?: boolean;
}
```

This avoids replacing the full document when only the sprint table needs changing.

## 8. Internal Helper Additions

The repo likely also needs helper-level building blocks, not only public tools.

Suggested internal helpers:

- `extractTablesFromDocumentJson`
- `buildInsertDateChipRequest`
- `buildUpdateTableCellStyleRequests`
- `buildUpdateTableBorderRequests`
- `buildUpdateColumnWidthRequests`
- `buildReplaceTableRowRequests`
- `buildCloneTableRequests`
- `buildRichCellContentRequests`
- `findHeadingRange`
- `findTableFollowingHeading`

## 9. Suggested Implementation Strategy

### Phase 1: Discovery and Non-Destructive Editing

Implement:

- `listDocumentTables`
- `getTableStructure`
- `findSectionsByHeading`
- `replaceTableRowData` for plain text cells

Outcome:

- can target the right table
- can replace rows without replacing the entire document

### Phase 2: Table Presentation Controls

Implement:

- `updateTableCellStyle`
- `updateTableBorders`
- `updateTableColumnWidth`
- `updateTableRowStyle`

Outcome:

- can reconstruct clean planning tables
- can restore header shading and widths

### Phase 3: Rich Cell Content

Implement:

- `RichCellContent`
- paragraph/list rendering inside cells
- row append/delete with style preservation

Outcome:

- can render `メモ / 相談` cleanly

### Phase 4: Smart Chips

Implement:

- `insertDateChip`
- `listSmartChips`

Outcome:

- can produce clickable planning metadata line

### Phase 5: Template Cloning

Implement:

- `cloneTable`
- style-copy helpers

Outcome:

- can take an old planning doc as template and only replace sprint data

## 10. API Design Notes

### 10.1 Favor Structure over Markdown for Tables

Markdown is still good for headings and simple text, but it is not sufficient for rich Google Docs tables.

Recommendation:

- keep Markdown tools for simple document edits
- introduce structured table-editing tools for rich docs

### 10.2 Preserve Existing Tools

Do not break:

- `replaceDocumentWithMarkdown`
- `readDocument`
- `applyTextStyle`
- `insertTableWithData`

Add new tools beside them.

### 10.3 Stable Table Identifiers

Since Google Docs does not expose user-friendly table IDs directly, the MCP layer should generate stable table identifiers from:

- table start index
- ordinal position in tab
- optional nearby heading anchor

Example:

- `table:t.0:3`
- `table:t.0:heading-今回のスプリントのタスク:0`

## 11. Validation and Testing

### 11.1 Unit Tests

Add tests for:

- document JSON table extraction
- smart chip request builders
- cell-style request builders
- border request builders
- row replacement builders
- rich cell content builders

### 11.2 Integration Tests

Add integration tests for:

1. cloning a table from a template doc
2. replacing task rows only
3. preserving header styles
4. rendering memo content with paragraphs and bullets
5. inserting a date chip

### 11.3 Golden Tests

Use golden JSON snapshots or exported markdown/json shape comparisons for:

- source template doc structure
- updated target doc structure

### 11.4 Manual Acceptance Tests

Acceptance criteria for the planning-doc scenario:

1. The metadata line shows a clickable date chip or equivalent chip object.
2. The task table header row remains shaded.
3. Column widths remain visually appropriate.
4. Task rows are updated without corrupting the rest of the document.
5. Memo cells remain readable and structured.
6. A second update run is idempotent and does not duplicate rows.

## 12. Backward Compatibility

The new tools should be additive.

Existing clients should continue working without any changes.

If any helper refactor is needed, keep the public tool behavior unchanged for:

- Markdown-based full document replacement
- plain-text reading
- simple text styling

## 13. Example End-to-End Agent Workflow

For a planning update task:

1. `findSectionsByHeading` with `今回のスプリントのタスク`
2. `listDocumentTables`
3. identify the task table below that heading
4. `deleteTableRows` for old sprint task rows except header
5. `appendTableRows` with new sprint tasks
6. `updateTableColumnWidth` for the expected layout
7. `updateTableCellStyle` on header row with blue background
8. `insertDateChip` or update the metadata block
9. `listSmartChips` and `getTableStructure` to verify

## 14. Recommended First Implementation Slice

If implementation time is limited, build this slice first:

1. `listDocumentTables`
2. `getTableStructure`
3. `replaceTableRowData`
4. `appendTableRows`
5. `deleteTableRows`
6. `updateTableCellStyle`
7. `updateTableColumnWidth`
8. `cloneTable`
9. `insertDateChip`

This slice unlocks nearly all planning-doc formatting use cases.

## 15. Open Questions

1. Which Google Docs API fields are available for cell background, borders, and dimensions in the current `googleapis` client version?
2. Can smart chips be inserted directly through Docs API requests, or is there any unsupported chip type requiring fallback behavior?
3. Should template cloning be exposed as a public MCP tool, or remain an internal helper behind a higher-level `updatePlanningDocumentFromTemplate` tool?
4. Should verification return raw structural data only, or also provide a rendered-quality heuristic?

## 16. Recommendation

Implement this feature set incrementally, but do not continue using full-document Markdown replacement for planning documents that depend on rich formatting.

For planning docs, the preferred long-term architecture is:

- template-aware
- table-aware
- chip-aware
- patch-based

That is the only reliable path to produce output that matches manually formatted Google Docs expectations.
