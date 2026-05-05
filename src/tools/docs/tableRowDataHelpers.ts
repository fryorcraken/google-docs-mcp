import { docs_v1 } from 'googleapis';
import { UserError } from 'fastmcp';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { ExtractedTable } from './structureHelpers.js';

type Docs = docs_v1.Docs;

export function buildReplaceTableCellContentRequests(
  cell: ExtractedTable['cells'][number],
  nextValue: string,
  tabId?: string
): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];

  const insertionIndex = cell.contentStartIndex ?? cell.startIndex;
  if (insertionIndex == null) {
    throw new UserError(
      `Cell [row=${cell.rowIndex}, col=${cell.columnIndex}] does not have a writable insertion index.`
    );
  }

  if (
    cell.text &&
    cell.contentStartIndex !== null &&
    cell.contentEndIndex !== null &&
    cell.contentEndIndex - 1 > cell.contentStartIndex
  ) {
    const range: Record<string, unknown> = {
      startIndex: cell.contentStartIndex,
      endIndex: cell.contentEndIndex - 1,
    };
    if (tabId) range.tabId = tabId;
    requests.push({
      deleteContentRange: { range: range as docs_v1.Schema$Range },
    });
  }

  if (nextValue) {
    const location: Record<string, unknown> = { index: insertionIndex };
    if (tabId) location.tabId = tabId;
    requests.push({
      insertText: {
        location: location as docs_v1.Schema$Location,
        text: nextValue,
      },
    });
  }

  return requests;
}

export function buildReplaceTableRowRequests(
  table: ExtractedTable,
  rowIndex: number,
  values: string[],
  tabId?: string
): docs_v1.Schema$Request[] {
  if (rowIndex < 0 || rowIndex >= table.rowCount) {
    throw new UserError(
      `Row index ${rowIndex} is out of bounds for table ${table.tableId} with ${table.rowCount} rows.`
    );
  }

  if (values.length > table.columnCount) {
    throw new UserError(
      `Received ${values.length} values for table ${table.tableId}, but the table only has ${table.columnCount} columns.`
    );
  }

  return table.cells
    .filter((cell) => cell.rowIndex === rowIndex)
    .sort((a, b) => b.columnIndex - a.columnIndex)
    .flatMap((cell) =>
      buildReplaceTableCellContentRequests(cell, values[cell.columnIndex] ?? '', tabId)
    );
}

export async function replaceTableRowData(
  docs: Docs,
  documentId: string,
  table: ExtractedTable,
  rowIndex: number,
  values: string[],
  tabId?: string
): Promise<void> {
  const requests = buildReplaceTableRowRequests(table, rowIndex, values, tabId);
  if (requests.length === 0) return;
  await GDocsHelpers.executeBatchUpdate(docs, documentId, requests);
}
