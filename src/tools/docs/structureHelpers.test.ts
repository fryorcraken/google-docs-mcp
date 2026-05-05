import { describe, expect, it } from 'vitest';
import { extractDocumentTables, findHeadings, getTableById } from './structureHelpers.js';

const mockDocument = {
  body: {
    content: [
      {
        startIndex: 1,
        endIndex: 25,
        paragraph: {
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          elements: [{ textRun: { content: '今回のスプリントのタスク\n' } }],
        },
      },
      {
        startIndex: 25,
        endIndex: 120,
        table: {
          tableRows: [
            {
              tableCells: [
                {
                  startIndex: 30,
                  endIndex: 40,
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'No.\n' } }],
                      },
                    },
                  ],
                },
                {
                  startIndex: 40,
                  endIndex: 60,
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: '課題名\n' } }],
                      },
                    },
                  ],
                },
              ],
            },
            {
              tableCells: [
                {
                  startIndex: 60,
                  endIndex: 78,
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: '1\n' } }],
                      },
                    },
                  ],
                },
                {
                  startIndex: 78,
                  endIndex: 118,
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'SHIN-2870 調査\n' } }],
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
        endIndex: 145,
        paragraph: {
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          elements: [{ textRun: { content: '5. TDAからTAPへの確認事項\n' } }],
        },
      },
    ],
  },
} as any;

describe('structureHelpers', () => {
  it('extracts tables with dimensions and cell text', () => {
    const tables = extractDocumentTables(mockDocument);

    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({
      tableId: 'table:body:0',
      rowCount: 2,
      columnCount: 2,
      startIndex: 25,
      endIndex: 120,
    });
    expect(tables[0].cells).toEqual([
      {
        rowIndex: 0,
        columnIndex: 0,
        startIndex: 30,
        endIndex: 40,
        contentStartIndex: null,
        contentEndIndex: null,
        text: 'No.',
      },
      {
        rowIndex: 0,
        columnIndex: 1,
        startIndex: 40,
        endIndex: 60,
        contentStartIndex: null,
        contentEndIndex: null,
        text: '課題名',
      },
      {
        rowIndex: 1,
        columnIndex: 0,
        startIndex: 60,
        endIndex: 78,
        contentStartIndex: null,
        contentEndIndex: null,
        text: '1',
      },
      {
        rowIndex: 1,
        columnIndex: 1,
        startIndex: 78,
        endIndex: 118,
        contentStartIndex: null,
        contentEndIndex: null,
        text: 'SHIN-2870 調査',
      },
    ]);
  });

  it('finds a table by its MCP table ID', () => {
    const table = getTableById(mockDocument, 'table:body:0');

    expect(table?.tableId).toBe('table:body:0');
    expect(getTableById(mockDocument, 'table:body:999')).toBeNull();
  });

  it('finds heading sections and the next table following the heading', () => {
    const sections = findHeadings(mockDocument, [
      '今回のスプリントのタスク',
      '5. TDAからTAPへの確認事項',
    ]);

    expect(sections).toEqual([
      {
        headingText: '今回のスプリントのタスク',
        headingLevel: 'HEADING_2',
        startIndex: 1,
        endIndex: 25,
        tableIdFollowing: 'table:body:0',
      },
      {
        headingText: '5. TDAからTAPへの確認事項',
        headingLevel: 'HEADING_2',
        startIndex: 120,
        endIndex: 145,
        tableIdFollowing: undefined,
      },
    ]);
  });
});
