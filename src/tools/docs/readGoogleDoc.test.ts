import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
  getDriveClient: vi.fn(),
}));

import { getDocsClient } from '../../clients.js';
import { register } from './readGoogleDoc.js';

const mockGetDocsClient = vi.mocked(getDocsClient);

let toolExecute: (args: any, context: any) => Promise<string>;

function captureToolExecute() {
  const fakeServer = {
    addTool: (config: any) => {
      toolExecute = config.execute;
    },
  };
  register(fakeServer as any);
}

const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

// Helper to build a mock docs client whose first .get() call returns a tab
// inventory (used by resolveTab) and whose subsequent calls return the
// supplied content payload.
function makeMockDocs(opts: {
  tabsInventory: any;
  contentResponse: any;
}) {
  const get = vi.fn();
  get.mockResolvedValueOnce({ data: opts.tabsInventory });
  get.mockResolvedValueOnce({ data: opts.contentResponse });
  return { documents: { get } };
}

describe('readDocument — tab handling (issue #1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('reads first tab content when tabbed doc is read with no tabId', async () => {
    // Regression: previously this path used the legacy body field mask on a
    // tabbed doc, returning "Document found, but appears empty." or the
    // comment-field validation error from issue #1. With resolveTab, we
    // detect the doc is tabbed and read the first tab's body.
    const mockDocs = makeMockDocs({
      tabsInventory: {
        tabs: [
          { tabProperties: { tabId: 't.first', title: 'First' } },
          { tabProperties: { tabId: 't.second', title: 'Second' } },
        ],
      },
      contentResponse: {
        title: 'Tabbed Doc',
        documentId: 'doc1',
        tabs: [
          {
            tabProperties: { tabId: 't.first', title: 'First' },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: 'first tab content' } }],
                    },
                  },
                ],
              },
            },
          },
          {
            tabProperties: { tabId: 't.second', title: 'Second' },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: 'second tab content' } }],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', format: 'text' },
      { log: mockLog }
    );

    expect(result).toContain('first tab content');
    expect(result).not.toContain('second tab content');
    expect(result).not.toContain('appears empty');
  });

  it('reads requested tab content when tabId is explicit', async () => {
    const mockDocs = makeMockDocs({
      tabsInventory: {
        tabs: [
          { tabProperties: { tabId: 't.first' } },
          { tabProperties: { tabId: 't.target' } },
        ],
      },
      contentResponse: {
        tabs: [
          {
            tabProperties: { tabId: 't.first' },
            documentTab: {
              body: {
                content: [
                  { paragraph: { elements: [{ textRun: { content: 'wrong tab' } }] } },
                ],
              },
            },
          },
          {
            tabProperties: { tabId: 't.target' },
            documentTab: {
              body: {
                content: [
                  { paragraph: { elements: [{ textRun: { content: 'right tab' } }] } },
                ],
              },
            },
          },
        ],
      },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', format: 'text', tabId: 't.target' },
      { log: mockLog }
    );

    expect(result).toContain('right tab');
    expect(result).not.toContain('wrong tab');
  });

  it('reads legacy body for non-tabbed docs (backward compat)', async () => {
    const mockDocs = makeMockDocs({
      tabsInventory: {}, // no tabs
      contentResponse: {
        body: {
          content: [
            { paragraph: { elements: [{ textRun: { content: 'legacy body content' } }] } },
          ],
        },
      },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', format: 'text' },
      { log: mockLog }
    );

    expect(result).toContain('legacy body content');
  });

  it('uses includeTabsContent=true for tabbed docs in the second get() call', async () => {
    const mockDocs = makeMockDocs({
      tabsInventory: { tabs: [{ tabProperties: { tabId: 't.x' } }] },
      contentResponse: {
        tabs: [
          {
            tabProperties: { tabId: 't.x' },
            documentTab: { body: { content: [] } },
          },
        ],
      },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1', format: 'text' }, { log: mockLog });

    // First call is resolveTab (minimal mask). Second call is the content read.
    const calls = mockDocs.documents.get.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[1][0].includeTabsContent).toBe(true);
    // The content-read field mask must NOT be the legacy body-only mask,
    // which is what triggered the comment-field validation error on tabbed
    // docs in issue #1.
    expect(calls[1][0].fields).toContain('documentTab');
  });

  it('uses legacy body field mask for non-tabbed docs', async () => {
    const mockDocs = makeMockDocs({
      tabsInventory: {},
      contentResponse: { body: { content: [] } },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1', format: 'text' }, { log: mockLog });

    const calls = mockDocs.documents.get.mock.calls;
    expect(calls[1][0].includeTabsContent).toBe(false);
    expect(calls[1][0].fields).toContain('body');
    expect(calls[1][0].fields).not.toContain('documentTab');
  });
});
