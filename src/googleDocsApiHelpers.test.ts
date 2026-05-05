import { describe, it, expect, vi } from 'vitest';
import { findTextRange, getTableCellRange, getParagraphRange } from './googleDocsApiHelpers.js';

describe('Text Range Finding', () => {
  describe('findTextRange', () => {
    it('should find text within a single text run correctly', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 25,
                          textRun: {
                            content: 'This is a test sentence.',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'test', 1);
      expect(result).toEqual({ startIndex: 11, endIndex: 15 });

      expect(mockDocs.documents.get).toHaveBeenCalledOnce();
      expect(mockDocs.documents.get).toHaveBeenCalledWith({
        documentId: 'doc123',
        fields:
          'body(content(paragraph(elements(startIndex,endIndex,textRun(content))),table,sectionBreak,tableOfContents,startIndex,endIndex))',
      });
    });

    it('should find the nth instance of text correctly', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 41,
                          textRun: {
                            content: 'Test test test. This is a test sentence.',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'test', 3);
      expect(result).toEqual({ startIndex: 27, endIndex: 31 });
    });

    it('should return null if text is not found', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 25,
                          textRun: {
                            content: 'This is a sample sentence.',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'test', 1);
      expect(result).toBeNull();
    });

    it('should find text in a specific tab when tabId is provided', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              tabs: [
                {
                  tabProperties: { tabId: 'tab1' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: 20,
                                textRun: { content: 'Tab 1 content here' },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  tabProperties: { tabId: 'tab2' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: 25,
                                textRun: { content: 'Meeting Notes are here.' },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          })),
        },
      };

      // Search in tab2 where "Meeting Notes" exists
      const result = await findTextRange(mockDocs as any, 'doc123', 'Meeting Notes', 1, 'tab2');
      expect(result).toEqual({ startIndex: 1, endIndex: 14 });

      // Verify includeTabsContent was used
      expect(mockDocs.documents.get).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc123',
          includeTabsContent: true,
        })
      );
    });

    it('should throw UserError when tabId is not found', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              tabs: [
                {
                  tabProperties: { tabId: 'tab1' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: 10,
                                textRun: { content: 'Some text' },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          })),
        },
      };

      await expect(
        findTextRange(mockDocs as any, 'doc123', 'test', 1, 'nonexistent')
      ).rejects.toThrow('Tab with ID "nonexistent" not found in document.');
    });

    it('should not use includeTabsContent when no tabId is provided', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 25,
                          textRun: { content: 'This is a test sentence.' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      await findTextRange(mockDocs as any, 'doc123', 'test', 1);

      // Should NOT include includeTabsContent
      expect(mockDocs.documents.get).toHaveBeenCalledWith(
        expect.not.objectContaining({
          includeTabsContent: true,
        })
      );
    });

    it('should handle text spanning multiple text runs', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 6,
                          textRun: { content: 'This ' },
                        },
                        {
                          startIndex: 6,
                          endIndex: 11,
                          textRun: { content: 'is a ' },
                        },
                        {
                          startIndex: 11,
                          endIndex: 20,
                          textRun: { content: 'test case' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'a test', 1);
      expect(result).toEqual({ startIndex: 9, endIndex: 15 });
    });
  });
});

describe('Paragraph Range Finding', () => {
  describe('getParagraphRange', () => {
    it('should find paragraph containing index in a specific tab', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              tabs: [
                {
                  tabProperties: { tabId: 'tab1' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          startIndex: 0,
                          endIndex: 1,
                          sectionBreak: {},
                        },
                        {
                          startIndex: 1,
                          endIndex: 20,
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: 20,
                                textRun: { content: 'First paragraph.\n' },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  tabProperties: { tabId: 'tab2' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          startIndex: 0,
                          endIndex: 1,
                          sectionBreak: {},
                        },
                        {
                          startIndex: 1,
                          endIndex: 25,
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: 25,
                                textRun: { content: 'Tab 2 first paragraph.\n' },
                              },
                            ],
                          },
                        },
                        {
                          startIndex: 25,
                          endIndex: 50,
                          paragraph: {
                            elements: [
                              {
                                startIndex: 25,
                                endIndex: 50,
                                textRun: { content: 'Tab 2 second paragraph.\n' },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          })),
        },
      };

      // Search for paragraph containing index 30 in tab2
      const result = await getParagraphRange(mockDocs as any, 'doc123', 30, 'tab2');
      expect(result).toEqual({ startIndex: 25, endIndex: 50 });

      // Verify includeTabsContent was used
      expect(mockDocs.documents.get).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc123',
          includeTabsContent: true,
        })
      );
    });

    it('should throw UserError when tabId is not found', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              tabs: [
                {
                  tabProperties: { tabId: 'tab1' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          startIndex: 1,
                          endIndex: 10,
                          paragraph: {},
                        },
                      ],
                    },
                  },
                },
              ],
            },
          })),
        },
      };

      await expect(getParagraphRange(mockDocs as any, 'doc123', 5, 'nonexistent')).rejects.toThrow(
        'Tab with ID "nonexistent" not found in document.'
      );
    });
  });
});

describe('Table Cell Range Finding', () => {
  // Helper to build a mock document with a table
  function buildMockDocsWithTable(tableStartIndex: number, tableRows: any[][]) {
    return {
      documents: {
        get: vi.fn(async () => ({
          data: {
            body: {
              content: [
                {
                  startIndex: 0,
                  endIndex: tableStartIndex,
                  paragraph: {
                    elements: [
                      {
                        startIndex: 0,
                        endIndex: tableStartIndex,
                        textRun: { content: 'Before table\n' },
                      },
                    ],
                  },
                },
                {
                  startIndex: tableStartIndex,
                  endIndex: 200,
                  table: {
                    rows: tableRows.length,
                    columns: tableRows[0]?.length ?? 0,
                    tableRows: tableRows.map((row) => ({
                      tableCells: row.map((cell) => ({
                        content: cell.content,
                      })),
                    })),
                  },
                },
              ],
            },
          },
        })),
      },
    };
  }

  describe('getTableCellRange', () => {
    it('should return correct range for a cell with text content', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [
          {
            content: [
              {
                startIndex: 16,
                endIndex: 26,
                paragraph: {
                  elements: [{ startIndex: 16, endIndex: 26, textRun: { content: 'Cell A1\n' } }],
                },
              },
            ],
          },
          {
            content: [
              {
                startIndex: 28,
                endIndex: 38,
                paragraph: {
                  elements: [{ startIndex: 28, endIndex: 38, textRun: { content: 'Cell B1\n' } }],
                },
              },
            ],
          },
        ],
      ]);

      const result = await getTableCellRange(mockDocs as any, 'doc123', 14, 0, 0);
      // endIndex should exclude the trailing \n (26 - 1 = 25)
      expect(result).toEqual({ startIndex: 16, endIndex: 25 });
    });

    it('should return correct range for second column', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [
          {
            content: [
              {
                startIndex: 16,
                endIndex: 26,
                paragraph: {
                  elements: [{ startIndex: 16, endIndex: 26, textRun: { content: 'Cell A1\n' } }],
                },
              },
            ],
          },
          {
            content: [
              {
                startIndex: 28,
                endIndex: 38,
                paragraph: {
                  elements: [{ startIndex: 28, endIndex: 38, textRun: { content: 'Cell B1\n' } }],
                },
              },
            ],
          },
        ],
      ]);

      const result = await getTableCellRange(mockDocs as any, 'doc123', 14, 0, 1);
      expect(result).toEqual({ startIndex: 28, endIndex: 37 });
    });

    it('should throw UserError if table not found at given startIndex', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [{ content: [{ startIndex: 16, endIndex: 20, paragraph: { elements: [] } }] }],
      ]);

      await expect(getTableCellRange(mockDocs as any, 'doc123', 999, 0, 0)).rejects.toThrow(
        'No table found at startIndex 999'
      );
    });

    it('should throw UserError if row index is out of range', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [{ content: [{ startIndex: 16, endIndex: 20, paragraph: { elements: [] } }] }],
      ]);

      await expect(getTableCellRange(mockDocs as any, 'doc123', 14, 5, 0)).rejects.toThrow(
        'Row index 5 is out of range'
      );
    });

    it('should throw UserError if column index is out of range', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [{ content: [{ startIndex: 16, endIndex: 20, paragraph: { elements: [] } }] }],
      ]);

      await expect(getTableCellRange(mockDocs as any, 'doc123', 14, 0, 5)).rejects.toThrow(
        'Column index 5 is out of range'
      );
    });

    it('should handle cell with multiple paragraphs', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [
          {
            content: [
              {
                startIndex: 16,
                endIndex: 26,
                paragraph: {
                  elements: [{ startIndex: 16, endIndex: 26, textRun: { content: 'Line one\n' } }],
                },
              },
              {
                startIndex: 26,
                endIndex: 36,
                paragraph: {
                  elements: [{ startIndex: 26, endIndex: 36, textRun: { content: 'Line two\n' } }],
                },
              },
            ],
          },
        ],
      ]);

      const result = await getTableCellRange(mockDocs as any, 'doc123', 14, 0, 0);
      // Should span from first paragraph start to last paragraph end - 1
      expect(result).toEqual({ startIndex: 16, endIndex: 35 });
    });
  });
});
