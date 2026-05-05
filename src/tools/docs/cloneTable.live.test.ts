import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getDocsClient, getDriveClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { buildInsertTableWithDataRequests } from './insertTableWithData.js';
import { extractTableSnapshot } from './structureHelpers.js';
import { register as registerCloneTable } from './cloneTable.js';
import { hexToRgbColor } from '../../types.js';

const runLive = process.env.GOOGLE_DOCS_LIVE_TESTS === '1';
const liveDescribe = runLive ? describe : describe.skip;

const mockLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

let toolExecute: (args: any, context: any) => Promise<string>;

const TABLE_FIELDS =
  'body(content(startIndex,endIndex,table(rows,columns,tableStyle(tableColumnProperties(width,widthType)),tableRows(startIndex,endIndex,tableRowStyle(minRowHeight,preventOverflow,tableHeader),tableCells(startIndex,endIndex,tableCellStyle(backgroundColor,borderTop(color,width,dashStyle),borderBottom(color,width,dashStyle),borderLeft(color,width,dashStyle),borderRight(color,width,dashStyle),contentAlignment,paddingTop,paddingBottom,paddingLeft,paddingRight,rowSpan,columnSpan),content(paragraph(elements(startIndex,endIndex,textRun(content,textStyle(bold))))))))))';

liveDescribe('cloneTable live integration', () => {
  const createdDocumentIds: string[] = [];

  beforeAll(() => {
    const fakeServer = { addTool: (config: any) => (toolExecute = config.execute) };
    registerCloneTable(fakeServer as any);
  });

  afterEach(async () => {
    const drive = await getDriveClient();
    while (createdDocumentIds.length > 0) {
      const fileId = createdDocumentIds.pop()!;
      try {
        await drive.files.delete({ fileId, supportsAllDrives: true });
      } catch {
        // Best-effort cleanup only.
      }
    }
  });

  it('clones a formatted table into a target document and preserves core formatting', async () => {
    const drive = await getDriveClient();
    const docs = await getDocsClient();

    const sourceDoc = await drive.files.create({
      requestBody: {
        name: `cloneTable-source-${Date.now()}`,
        mimeType: 'application/vnd.google-apps.document',
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const targetDoc = await drive.files.create({
      requestBody: {
        name: `cloneTable-target-${Date.now()}`,
        mimeType: 'application/vnd.google-apps.document',
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    const sourceDocumentId = sourceDoc.data.id!;
    const targetDocumentId = targetDoc.data.id!;
    createdDocumentIds.push(sourceDocumentId, targetDocumentId);

    const sourceData = [
      ['No.', '課題名'],
      ['1', 'SHIN-2870 調査'],
    ];

    await GDocsHelpers.executeBatchUpdateWithSplitting(
      docs,
      sourceDocumentId,
      buildInsertTableWithDataRequests(sourceData, 1, true),
      mockLog
    );

    const sourceTableStart = 2;
    const styleRequests = [
      GDocsHelpers.buildTableColumnWidthRequest(sourceTableStart, [0], 60),
      GDocsHelpers.buildTableColumnWidthRequest(sourceTableStart, [1], 180),
      GDocsHelpers.buildPinTableHeaderRowsRequest(sourceTableStart, 1),
      GDocsHelpers.buildTableRowStyleRequest(sourceTableStart, [0], 24, true),
    ].filter(Boolean);

    const headerBg = hexToRgbColor('#D9E2F3')!;
    const headerCellStyle = GDocsHelpers.buildTableCellStyleRequest(sourceTableStart, 0, 0, {
      rowSpan: 1,
      columnSpan: 2,
      backgroundColor: headerBg,
      contentAlignment: 'CENTER',
      paddingTopPt: 6,
      paddingBottomPt: 6,
    });
    if (headerCellStyle) styleRequests.push(headerCellStyle.request);

    await GDocsHelpers.executeBatchUpdateWithSplitting(
      docs,
      sourceDocumentId,
      styleRequests,
      mockLog
    );

    await toolExecute(
      {
        documentId: targetDocumentId,
        sourceDocumentId,
        sourceTableId: 'table:body:0',
        index: 1,
      },
      { log: mockLog }
    );

    const targetRes = await docs.documents.get({
      documentId: targetDocumentId,
      fields: TABLE_FIELDS,
    });

    const snapshot = extractTableSnapshot(targetRes.data, 'table:body:0');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.data).toEqual(sourceData);
    expect(snapshot!.pinnedHeaderRowsCount).toBe(1);
    expect(snapshot!.columnStyles).toEqual([
      { columnIndex: 0, widthPt: 60, widthType: 'FIXED_WIDTH' },
      { columnIndex: 1, widthPt: 180, widthType: 'FIXED_WIDTH' },
    ]);
    expect(snapshot!.rowStyles[0]).toMatchObject({
      rowIndex: 0,
      minRowHeightPt: 24,
      preventOverflow: true,
      tableHeader: true,
    });
    expect(snapshot!.cellStyles[0]).toMatchObject({
      rowIndex: 0,
      columnIndex: 0,
      contentAlignment: 'CENTER',
      paddingTopPt: 6,
      paddingBottomPt: 6,
      hasBoldText: true,
    });
  }, 120000);
});
