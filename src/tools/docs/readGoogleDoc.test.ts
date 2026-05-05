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

// Single-get mock: readGoogleDoc now issues exactly one documents.get per
// invocation and resolves the tab against the same payload.
function makeMockDocs(response: any) {
  const get = vi.fn().mockResolvedValue({ data: response });
  return { documents: { get } };
}

const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

describe('readDocument — tab handling (issue #1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('reads first tab content when tabbed doc is read with no tabId', async () => {
    // Regression: previously this path used the legacy body field mask on a
    // tabbed doc, returning "Document found, but appears empty." or the
    // comment-field validation error from issue #1.
    const mockDocs = makeMockDocs({
      title: 'Tabbed Doc',
      documentId: 'doc1',
      tabs: [
        {
          tabProperties: { tabId: 't.first', title: 'First' },
          documentTab: {
            body: {
              content: [
                { paragraph: { elements: [{ textRun: { content: 'first tab content' } }] } },
              ],
            },
          },
        },
        {
          tabProperties: { tabId: 't.second', title: 'Second' },
          documentTab: {
            body: {
              content: [
                { paragraph: { elements: [{ textRun: { content: 'second tab content' } }] } },
              ],
            },
          },
        },
      ],
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
      tabs: [
        {
          tabProperties: { tabId: 't.first' },
          documentTab: {
            body: {
              content: [{ paragraph: { elements: [{ textRun: { content: 'wrong tab' } }] } }],
            },
          },
        },
        {
          tabProperties: { tabId: 't.target' },
          documentTab: {
            body: {
              content: [{ paragraph: { elements: [{ textRun: { content: 'right tab' } }] } }],
            },
          },
        },
      ],
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
      body: {
        content: [
          { paragraph: { elements: [{ textRun: { content: 'legacy body content' } }] } },
        ],
      },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', format: 'text' },
      { log: mockLog }
    );

    expect(result).toContain('legacy body content');
  });

  it('issues exactly one documents.get call (no separate resolve fetch)', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.x' },
          documentTab: { body: { content: [] } },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1', format: 'text' }, { log: mockLog });

    expect(mockDocs.documents.get).toHaveBeenCalledOnce();
    expect(mockDocs.documents.get).toHaveBeenCalledWith({
      documentId: 'doc1',
      includeTabsContent: true,
      fields: expect.stringContaining('documentTab'),
    });
  });

  it('format=json on tabbed doc preserves lists field', async () => {
    // Critical regression check: the tabbed contentSource previously dropped
    // `lists` (and inlineObjects, etc.), making JSON output structurally
    // different from the non-tabbed path and breaking markdown rendering.
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.first' },
          documentTab: {
            body: { content: [{ paragraph: { elements: [{ textRun: { content: 'x' } }] } }] },
            lists: { 'kix.123': { listProperties: { nestingLevels: [{ glyphType: 'BULLET' }] } } },
            inlineObjects: { 'kix.img1': { objectId: 'kix.img1' } },
          },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', format: 'json' },
      { log: mockLog }
    );

    const parsed = JSON.parse(result);
    expect(parsed.lists).toBeDefined();
    expect(parsed.lists['kix.123']).toBeDefined();
    expect(parsed.inlineObjects).toBeDefined();
    expect(parsed.body).toBeDefined();
  });

  it('format=markdown on tabbed doc retains content from the resolved tab', async () => {
    // The markdown transformer needs `lists` to render bullets — without
    // the field, list items lose their glyph type. We don't assert specific
    // markdown output (transformer behavior is tested elsewhere); we just
    // verify the transformer ran against the tab content.
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.first' },
          documentTab: {
            body: {
              content: [
                { paragraph: { elements: [{ textRun: { content: 'item one\n' } }] } },
              ],
            },
            lists: {
              'kix.list1': {
                listProperties: { nestingLevels: [{ glyphType: 'GLYPH_TYPE_UNSPECIFIED' }] },
              },
            },
          },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', format: 'markdown' },
      { log: mockLog }
    );

    expect(result).toContain('item one');
  });
});
