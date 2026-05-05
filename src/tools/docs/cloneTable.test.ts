import { describe, expect, it } from 'vitest';
import { extractTableSnapshot, findTableNearestStartIndex } from './structureHelpers.js';
import { readFileSync } from 'node:fs';

const mockDocument = {
  body: {
    content: [
      {
        startIndex: 10,
        endIndex: 100,
        table: {
          rows: 2,
          columns: 2,
          tableStyle: {
            tableColumnProperties: [
              { widthType: 'FIXED_WIDTH', width: { magnitude: 60, unit: 'PT' } },
              { widthType: 'FIXED_WIDTH', width: { magnitude: 180, unit: 'PT' } },
            ],
          },
          tableRows: [
            {
              tableRowStyle: {
                minRowHeight: { magnitude: 24, unit: 'PT' },
                tableHeader: true,
              },
              tableCells: [
                {
                  startIndex: 15,
                  endIndex: 25,
                  tableCellStyle: {
                    backgroundColor: { color: { rgbColor: { red: 0.85, green: 0.9, blue: 0.95 } } },
                    contentAlignment: 'MIDDLE',
                    paddingTop: { magnitude: 6, unit: 'PT' },
                  },
                  content: [
                    {
                      paragraph: {
                        elements: [
                          {
                            startIndex: 16,
                            endIndex: 19,
                            textRun: {
                              content: 'No.\n',
                              textStyle: { bold: true },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  startIndex: 25,
                  endIndex: 45,
                  content: [
                    {
                      paragraph: {
                        elements: [
                          {
                            startIndex: 26,
                            endIndex: 30,
                            textRun: {
                              content: '課題名\n',
                              textStyle: { bold: true },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            {
              tableCells: [
                {
                  startIndex: 45,
                  endIndex: 55,
                  content: [
                    {
                      paragraph: {
                        elements: [{ startIndex: 46, endIndex: 47, textRun: { content: '1\n' } }],
                      },
                    },
                  ],
                },
                {
                  startIndex: 55,
                  endIndex: 95,
                  content: [
                    {
                      paragraph: {
                        elements: [
                          {
                            startIndex: 56,
                            endIndex: 69,
                            textRun: { content: 'SHIN-2870 調査\n' },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        startIndex: 120,
        endIndex: 180,
        table: {
          rows: 1,
          columns: 1,
          tableRows: [
            {
              tableCells: [
                {
                  startIndex: 125,
                  endIndex: 135,
                  content: [
                    {
                      paragraph: {
                        elements: [{ startIndex: 126, endIndex: 130, textRun: { content: 'X\n' } }],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },
} as any;

describe('table snapshot helpers', () => {
  it('extracts a reusable table snapshot with styles', () => {
    const snapshot = extractTableSnapshot(mockDocument, 'table:body:0');

    expect(snapshot).toMatchObject({
      tableId: 'table:body:0',
      rowCount: 2,
      columnCount: 2,
      pinnedHeaderRowsCount: 1,
      data: [
        ['No.', '課題名'],
        ['1', 'SHIN-2870 調査'],
      ],
      columnStyles: [
        { columnIndex: 0, widthPt: 60, widthType: 'FIXED_WIDTH' },
        { columnIndex: 1, widthPt: 180, widthType: 'FIXED_WIDTH' },
      ],
    });
    expect(snapshot?.rowStyles[0]).toMatchObject({
      rowIndex: 0,
      minRowHeightPt: 24,
      tableHeader: true,
    });
    expect(snapshot?.cellStyles[0]).toMatchObject({
      rowIndex: 0,
      columnIndex: 0,
      contentAlignment: 'MIDDLE',
      paddingTopPt: 6,
      hasBoldText: true,
    });
  });

  it('finds the table nearest to an insertion index', () => {
    const table = findTableNearestStartIndex(mockDocument, 100);
    expect(table?.tableId).toBe('table:body:1');
  });

  it('requests tab table text and contentAlignment with the same structure as body tables', () => {
    const source = readFileSync(new URL('./cloneTable.ts', import.meta.url), 'utf8');
    expect(source).toContain(
      'contentAlignment,paddingTop,paddingBottom,paddingLeft,paddingRight,rowSpan,columnSpan),content(paragraph('
    );
  });
});
