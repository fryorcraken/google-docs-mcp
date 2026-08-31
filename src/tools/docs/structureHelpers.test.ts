import { describe, expect, it } from 'vitest';
import {
  extractDocumentTables,
  findHeadings,
  getTableById,
  listAllHeadings,
} from './structureHelpers.js';

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

  it('carries headingId through findHeadings when present in the paragraph style', () => {
    const docWithHeadingId = {
      body: {
        content: [
          {
            startIndex: 1,
            endIndex: 10,
            paragraph: {
              paragraphStyle: { namedStyleType: 'HEADING_1', headingId: 'h.abc123' },
              elements: [{ textRun: { content: 'Setup\n' } }],
            },
          },
        ],
      },
    } as any;

    const sections = findHeadings(docWithHeadingId, ['Setup']);
    expect(sections).toHaveLength(1);
    expect(sections[0].headingId).toBe('h.abc123');
  });

  it('lists all headings in document order with their headingId, ignoring non-heading paragraphs', () => {
    const headings = listAllHeadings(mockDocument);

    expect(headings).toEqual([
      {
        headingText: '今回のスプリントのタスク',
        headingLevel: 'HEADING_2',
        startIndex: 1,
        endIndex: 25,
        headingId: undefined,
      },
      {
        headingText: '5. TDAからTAPへの確認事項',
        headingLevel: 'HEADING_2',
        startIndex: 120,
        endIndex: 145,
        headingId: undefined,
      },
    ]);
  });

  it('listAllHeadings surfaces headingId when present', () => {
    const docWithHeadingId = {
      body: {
        content: [
          {
            startIndex: 1,
            endIndex: 10,
            paragraph: {
              paragraphStyle: { namedStyleType: 'HEADING_1', headingId: 'h.xyz789' },
              elements: [{ textRun: { content: 'Intro\n' } }],
            },
          },
        ],
      },
    } as any;

    expect(listAllHeadings(docWithHeadingId)).toEqual([
      {
        headingText: 'Intro',
        headingLevel: 'HEADING_1',
        startIndex: 1,
        endIndex: 10,
        headingId: 'h.xyz789',
      },
    ]);
  });

  it('throws UserError when an unknown tabId is supplied', () => {
    // Regression: previously getContentSource silently returned [] when the
    // tab lookup failed, so callers got "no tables found" instead of a
    // clear error pointing at the bad tabId.
    const tabbedDoc = {
      tabs: [
        {
          tabProperties: { tabId: 't.real' },
          documentTab: { body: { content: [] } },
        },
      ],
    } as any;

    expect(() => extractDocumentTables(tabbedDoc, 't.bogus')).toThrow(/Tab "t.bogus" not found/);
  });

  it('falls back to first tab when no tabId is supplied on a tabbed doc', () => {
    const tabbedDoc = {
      tabs: [
        {
          tabProperties: { tabId: 't.first' },
          documentTab: {
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 50,
                  table: {
                    tableRows: [
                      {
                        tableCells: [
                          {
                            startIndex: 5,
                            endIndex: 20,
                            content: [
                              {
                                paragraph: {
                                  elements: [{ textRun: { content: 'cell from first tab\n' } }],
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
          },
        },
      ],
    } as any;

    const tables = extractDocumentTables(tabbedDoc);
    expect(tables).toHaveLength(1);
    expect(tables[0].cells[0].text).toBe('cell from first tab');
  });
});
