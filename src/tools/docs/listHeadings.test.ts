import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

import { getDocsClient } from '../../clients.js';
import { register } from './listHeadings.js';

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

function makeMockDocs(resolveResponse: any) {
  return {
    documents: {
      get: vi.fn().mockResolvedValue({ data: resolveResponse }),
    },
  };
}

describe('listHeadings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('lists headings with headingId for a legacy (non-tabbed) document', async () => {
    const mockDocs = makeMockDocs({
      body: {
        content: [
          {
            startIndex: 1,
            endIndex: 10,
            paragraph: {
              paragraphStyle: { namedStyleType: 'HEADING_1', headingId: 'h.abc' },
              elements: [{ textRun: { content: 'Setup\n' } }],
            },
          },
          {
            startIndex: 10,
            endIndex: 30,
            paragraph: {
              elements: [{ textRun: { content: 'Some normal paragraph.\n' } }],
            },
          },
        ],
      },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute({ documentId: 'doc1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.tabId).toBeNull();
    expect(parsed.headings).toEqual([
      {
        headingText: 'Setup',
        headingLevel: 'HEADING_1',
        startIndex: 1,
        endIndex: 10,
        headingId: 'h.abc',
      },
    ]);
  });

  it('drops the headingId key from the JSON output when the heading paragraph has none', async () => {
    // JSON.stringify drops keys whose value is undefined, so a heading with
    // namedStyleType but no headingId serializes to an object with no
    // "headingId" key at all — not "headingId": null. Assert on the parsed
    // JSON (not the in-memory ExtractedHeading object) since that's what a
    // real MCP caller actually sees.
    const mockDocs = makeMockDocs({
      body: {
        content: [
          {
            startIndex: 1,
            endIndex: 10,
            paragraph: {
              paragraphStyle: { namedStyleType: 'HEADING_1' },
              elements: [{ textRun: { content: 'Untitled section\n' } }],
            },
          },
        ],
      },
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute({ documentId: 'doc1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.headings).toHaveLength(1);
    expect('headingId' in parsed.headings[0]).toBe(false);
  });

  it('defaults to the first tab on a tabbed document when tabId is omitted', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.first' },
          documentTab: {
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 12,
                  paragraph: {
                    paragraphStyle: { namedStyleType: 'HEADING_2', headingId: 'h.first' },
                    elements: [{ textRun: { content: 'First tab heading\n' } }],
                  },
                },
              ],
            },
          },
        },
        {
          tabProperties: { tabId: 't.second' },
          documentTab: {
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 12,
                  paragraph: {
                    paragraphStyle: { namedStyleType: 'HEADING_2', headingId: 'h.second' },
                    elements: [{ textRun: { content: 'Second tab heading\n' } }],
                  },
                },
              ],
            },
          },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute({ documentId: 'doc1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.tabId).toBe('t.first');
    expect(parsed.headings).toHaveLength(1);
    expect(parsed.headings[0].headingId).toBe('h.first');
  });

  it('lists headings for an explicitly requested tab', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.first' },
          documentTab: { body: { content: [] } },
        },
        {
          tabProperties: { tabId: 't.second' },
          documentTab: {
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 12,
                  paragraph: {
                    paragraphStyle: { namedStyleType: 'HEADING_2', headingId: 'h.second' },
                    elements: [{ textRun: { content: 'Second tab heading\n' } }],
                  },
                },
              ],
            },
          },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute({ documentId: 'doc1', tabId: 't.second' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.tabId).toBe('t.second');
    expect(parsed.headings[0].headingId).toBe('h.second');
  });

  it('rejects with a clear error when explicit tabId does not exist', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await expect(
      toolExecute({ documentId: 'doc1', tabId: 't.nope' }, { log: mockLog })
    ).rejects.toThrow(/Tab "t.nope" not found/);
  });
});
