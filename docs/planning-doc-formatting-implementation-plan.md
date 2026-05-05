# Implementation Plan: Planning Doc Formatting Support

**Scope**: `google-docs-mcp`  
**Related Spec**: [planning-doc-formatting-spec.md](./planning-doc-formatting-spec.md)  
**Last Updated**: 2026-04-27

## 1. Objective

Implement the minimum set of Google Docs MCP capabilities needed to update rich planning documents without destroying their formatting.

This plan is intentionally tied to the current codebase structure so implementation can proceed incrementally.

## 2. Current Codebase Mapping

Relevant existing files:

- `src/tools/docs/index.ts`
  - Docs tool router
- `src/tools/docs/readGoogleDoc.ts`
  - document fetch and content conversion
- `src/tools/docs/insertTableWithData.ts`
  - current table insertion logic
- `src/tools/docs/formatting/applyTextStyle.ts`
  - text-level style application
- `src/googleDocsApiHelpers.ts`
  - shared request builders, tab helpers, search helpers, batch update utilities
- `src/types.ts`
  - shared zod schemas and tool argument types

Current limitation:

- table operations are insertion-oriented, not template-preserving
- formatting support is text-first, not table-first
- no stable table discovery API exists
- smart chip support is incomplete and not yet verified end-to-end

## 3. Delivery Strategy

The work should be delivered in 5 phases.

## 4. Phase 1: Discovery and Safe Targeting

### Goal

Allow an agent to locate the correct table and heading section before mutating anything.

### Deliverables

- `listDocumentTables`
- `getTableStructure`
- `findSectionsByHeading`
- helper extraction layer for document tables and headings

### Code Locations

- `src/tools/docs/listDocumentTables.ts`
- `src/tools/docs/getTableStructure.ts`
- `src/tools/docs/findSectionsByHeading.ts`
- `src/tools/docs/structureHelpers.ts`
- `src/tools/docs/index.ts`

### Notes

- Table IDs should remain MCP-generated and stable within a single read pass.
- For now, IDs can be ordinal-based: `table:<tab-or-body>:<ordinal>`.
- This phase should avoid introducing any write-side table mutation yet.

### Validation

- unit tests for table extraction and heading lookup
- manual invocation on a real planning doc

## 5. Phase 2: Plain Row Replacement Without Format Loss

### Goal

Allow replacing, appending, and deleting table rows while preserving existing table formatting.

### Deliverables

- `appendTableRows`
- `deleteTableRows`
- `replaceTableRowData`

### Technical Direction

Preferred implementation:

1. read full document structure
2. locate target table and target row cells
3. mutate cell contents through targeted delete/insert requests
4. preserve table structure itself

### Design Constraint

Do not use `replaceDocumentWithMarkdown` for planning doc tables once these tools exist.

### Code Locations

- `src/tools/docs/appendTableRows.ts`
- `src/tools/docs/deleteTableRows.ts`
- `src/tools/docs/replaceTableRowData.ts`
- `src/googleDocsApiHelpers.ts`

### Risks

- Google Docs table indexes shift as text is inserted/deleted
- row insertion may require careful reverse-order updates
- merged cells are out of scope for the first implementation

## 6. Phase 3: Table Presentation Controls

### Goal

Enable recreation of the visual structure expected in planning docs.

### Deliverables

- `updateTableCellStyle`
- `updateTableBorders`
- `updateTableColumnWidth`
- `updateTableRowStyle`

### Technical Direction

Add request builders in `googleDocsApiHelpers.ts` for:

- cell background
- cell alignment
- border style
- row height
- column width

### Code Locations

- `src/tools/docs/updateTableCellStyle.ts`
- `src/tools/docs/updateTableBorders.ts`
- `src/tools/docs/updateTableColumnWidth.ts`
- `src/tools/docs/updateTableRowStyle.ts`
- `src/types.ts`
- `src/googleDocsApiHelpers.ts`

### Acceptance Criteria

- header row can be shaded blue
- `No.` column can be narrow
- `メモ / 相談` column can be wide
- borders remain clean and consistent

## 7. Phase 4: Rich Content Inside Table Cells

### Goal

Render memo cells as readable structured content rather than flat strings.

### Deliverables

- `RichCellContent` model
- support for multiple paragraphs inside a cell
- support for bullet lists inside a cell
- support for mixed bold/plain/link text runs inside a cell

### Technical Direction

Introduce a structured input model instead of overloading Markdown tables.

Suggested model:

- paragraph blocks
- bulleted list blocks
- numbered list blocks
- styled text runs inside each block

### Code Locations

- `src/types.ts`
- `src/googleDocsApiHelpers.ts`
- row mutation tools from phase 2

### Acceptance Criteria

Memo cells can represent:

- `影響箇所`
- bullet list
- `対応方針`
- bullet list
- `想定成果物`
- bullet list

without corrupting the table layout.

## 8. Phase 5: Smart Chips and Template-Aware Updates

### Goal

Support planning-doc metadata and template reuse.

### Deliverables

- `insertDateChip`
- `insertPerson`
- `insertRichLink`
- `listSmartChips`
- `cloneTable`
- optional higher-level planning-template updater

### Technical Direction

Smart chips:

- investigate exact Docs API support available through current `googleapis` version
- if chip insertion is partially unsupported, provide a clear fallback mode

Template reuse:

- clone a formatted table from an old planning document
- only replace sprint rows

### Code Locations

- `src/tools/docs/insertDateChip.ts`
- `src/tools/docs/insertPerson.ts`
- `src/tools/docs/insertRichLink.ts`
- `src/tools/docs/listSmartChips.ts`
- `src/tools/docs/cloneTable.ts`
- helper additions in `src/googleDocsApiHelpers.ts`

## 9. Delivery Status

Status as of 2026-04-27:

- Phase 1: implemented at tool surface level with helper tests
- Phase 2: implemented at tool surface level with row mutation helpers and tests
- Phase 3: implemented at tool surface level with request-builder tests
- Phase 5 smart-chip subset: started early
- Phase 5 template subset: started with `cloneTable`

Early smart-chip work currently includes:

- `insertDateChip`
- `insertPerson`
- `insertRichLink`
- `listSmartChips`
- `smartChipHelpers`

This was pulled ahead of the original order because planning-doc metadata support is a blocker for realistic template updates.

Early template work currently includes:

- `cloneTable`
- `extractTableSnapshot`
- nearest-target-table re-identification after insert

## 10. Suggested Implementation Order

Recommended execution order for actual coding:

1. phase 1 discovery tools
2. plain row append/delete/replace
3. header row styling and column sizing
4. rich memo cell content
5. date/person/rich-link chip insertion
6. template cloning

This order keeps the system useful after each increment.

## 11. Test Plan

### Unit Tests

Add tests for:

- extracting tables from document JSON
- finding headings and associated tables
- resolving row/cell addressing
- building table style requests
- building row replacement requests

### Integration Tests

Add live or mocked integration coverage for:

- list tables on a document with a single planning table
- replace only table body rows
- preserve table header row
- insert a date chip

### Manual Tests

Use a real planning document to verify:

1. task table is found correctly
2. rows can be updated without replacing the whole doc
3. old formatting remains intact
4. datetime line remains interactive once chips are supported

## 11. Status

Implemented in this iteration:

- `listDocumentTables`
- `getTableStructure`
- `findSectionsByHeading`
- `structureHelpers` test coverage
- `replaceTableRowData`
- `appendTableRows`
- `deleteTableRows`
- shared row-content replacement helpers
- shared table row request builders
- `updateTableCellStyle`
- `updateTableBorders`
- `updateTableColumnWidth`
- `updateTableRowStyle`
- shared table formatting request builders
- unit tests for table formatting request builders

Not yet implemented:

- verified end-to-end row mutation against a live document
- verified end-to-end table styling against a live document
- smart chip tools
- template cloning
- rich memo cell content blocks

## 12. Immediate Next Task

The next implementation task should be:

### Smart chip tools + template cloning

Reason:

- row mutation and basic styling tool surfaces now exist
- the next blockers for planning docs are clickable metadata chips and template-preserving cloning
- without those, planning docs can improve visually but still cannot fully match the existing manual workflow
