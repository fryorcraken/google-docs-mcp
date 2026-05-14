import { describe, it, expect, vi } from 'vitest';
import {
  findTextRange,
  getTableCellRange,
  getParagraphRange,
  resolveTab,
  resolveTabFromDocument,
} from './googleDocsApiHelpers.js';

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

describe('resolveTab', () => {
  const makeMockDocs = (tabsResponse: unknown) => ({
    documents: {
      get: vi.fn(async () => ({ data: tabsResponse })),
    },
  });

  it('returns isTabbed=false for documents without tabs', async () => {
    const mockDocs = makeMockDocs({});
    const result = await resolveTab(mockDocs as any, 'doc1');
    expect(result).toEqual({ tabId: undefined, isTabbed: false, firstTabId: undefined });
  });

  it('returns isTabbed=false when tabs array is empty', async () => {
    const mockDocs = makeMockDocs({ tabs: [] });
    const result = await resolveTab(mockDocs as any, 'doc1');
    expect(result.isTabbed).toBe(false);
    expect(result.tabId).toBeUndefined();
  });

  it('defaults to first tab when requestedTabId is undefined on a tabbed doc', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        { tabProperties: { tabId: 't.first', title: 'First' } },
        { tabProperties: { tabId: 't.second', title: 'Second' } },
      ],
    });
    const result = await resolveTab(mockDocs as any, 'doc1');
    expect(result).toEqual({ tabId: 't.first', isTabbed: true, firstTabId: 't.first' });
  });

  it('returns the requested tab when it exists', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.target' } }],
    });
    const result = await resolveTab(mockDocs as any, 'doc1', 't.target');
    expect(result.tabId).toBe('t.target');
    expect(result.isTabbed).toBe(true);
  });

  it('finds tabs nested under childTabs', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.parent' },
          childTabs: [{ tabProperties: { tabId: 't.child' } }],
        },
      ],
    });
    const result = await resolveTab(mockDocs as any, 'doc1', 't.child');
    expect(result.tabId).toBe('t.child');
  });

  it('finds grandchildren two levels deep under childTabs', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.parent' },
          childTabs: [
            {
              tabProperties: { tabId: 't.child' },
              childTabs: [{ tabProperties: { tabId: 't.grandchild' } }],
            },
          ],
        },
      ],
    });
    const result = await resolveTab(mockDocs as any, 'doc1', 't.grandchild');
    expect(result.tabId).toBe('t.grandchild');
  });

  it('finds great-grandchildren three levels deep under childTabs', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.parent' },
          childTabs: [
            {
              tabProperties: { tabId: 't.child' },
              childTabs: [
                {
                  tabProperties: { tabId: 't.grandchild' },
                  childTabs: [{ tabProperties: { tabId: 't.great' } }],
                },
              ],
            },
          ],
        },
      ],
    });
    const result = await resolveTab(mockDocs as any, 'doc1', 't.great');
    expect(result.tabId).toBe('t.great');
  });

  it('throws UserError listing available tabs when requested tab is missing', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.second' } }],
    });
    await expect(resolveTab(mockDocs as any, 'doc1', 't.nope')).rejects.toThrow(
      /Tab "t.nope" not found.*"t.first".*"t.second"/
    );
  });

  it('throws UserError when tabId is supplied for a non-tabbed document', async () => {
    const mockDocs = makeMockDocs({});
    await expect(resolveTab(mockDocs as any, 'doc1', 't.anything')).rejects.toThrow(
      /has no tabs.*tabId="t.anything"/
    );
  });

  it('uses includeTabsContent=true and a minimal field mask without bare childTabs', async () => {
    // Regression: a bare `childTabs` in the field mask returns the full
    // subtree, including documentTab.body... paths that the Docs API
    // counts as "comment-specific fields". On documents that contain
    // comments, the API rejects the read with:
    //   "Field mask cannot retrieve comment-specific fields when
    //    include_comments is false."
    // The mask must explicitly nest childTabs and restrict each level
    // to tabProperties only. See issue #18.
    const mockDocs = makeMockDocs({});
    await resolveTab(mockDocs as any, 'doc1');
    const call = mockDocs.documents.get.mock.calls[0][0];
    expect(call.documentId).toBe('doc1');
    expect(call.includeTabsContent).toBe(true);
    expect(typeof call.fields).toBe('string');
    // Top-level tabs() must restrict to tabProperties(...) only.
    expect(call.fields).not.toMatch(/tabs\([^)]*documentTab/);
    // No bare `childTabs` anywhere (would-be `,childTabs` or `(childTabs`).
    expect(call.fields).not.toMatch(/[,(]childTabs(?:[,)])/);
  });
});

describe('resolveTabFromDocument', () => {
  it('resolves against an already-fetched document without making a get call', () => {
    // This exists so tools that already need full content can issue ONE
    // get() and call this helper directly — saves an RTT and eliminates
    // a race window where tabs change between calls.
    const doc = {
      tabs: [
        {
          tabProperties: { tabId: 't.first' },
          documentTab: { body: { content: [] } },
        },
        {
          tabProperties: { tabId: 't.second' },
          documentTab: { body: { content: [] } },
        },
      ],
    };

    const result = resolveTabFromDocument(doc as any, 'doc1', 't.second');
    expect(result).toEqual({ tabId: 't.second', isTabbed: true, firstTabId: 't.first' });
  });

  it('resolves grandchildren when the document was fetched with childTabs subtree', () => {
    const doc = {
      tabs: [
        {
          tabProperties: { tabId: 't.parent' },
          childTabs: [
            {
              tabProperties: { tabId: 't.child' },
              childTabs: [{ tabProperties: { tabId: 't.grandchild' } }],
            },
          ],
        },
      ],
    };
    const result = resolveTabFromDocument(doc as any, 'doc1', 't.grandchild');
    expect(result.tabId).toBe('t.grandchild');
  });

  it('error message for non-tabbed doc with tabId nudges the caller to omit', () => {
    expect(() => resolveTabFromDocument({} as any, 'doc1', 't.x')).toThrow(/Omit tabId/);
  });
});
