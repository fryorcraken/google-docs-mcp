import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    executeBatchUpdate: vi.fn(),
  };
});

import { getDocsClient } from '../../../clients.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';
import { register } from './applyTextStyle.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockExecuteBatchUpdate = vi.mocked(GDocsHelpers.executeBatchUpdate);

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

describe('applyTextStyle — tab handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('resolves to the first tab when a tabbed doc has no tabId arg', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.second' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', target: { startIndex: 1, endIndex: 5 }, style: { bold: true } },
      { log: mockLog }
    );

    expect(result).toContain('t.first');
    const request = mockExecuteBatchUpdate.mock.calls[0][2][0];
    expect(request.updateTextStyle?.range?.tabId).toBe('t.first');
  });

  it('rejects with a clear error when explicit tabId does not exist in the document', async () => {
    // Regression: previously applyTextStyle passed args.tabId straight through
    // to buildUpdateTextStyleRequest without validating it against the
    // document's tabs, unlike modifyText's resolveTab call — a bad tabId
    // surfaced as an opaque Google API error instead of a clear UserError.
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await expect(
      toolExecute(
        {
          documentId: 'doc1',
          target: { startIndex: 1, endIndex: 5 },
          style: { bold: true },
          tabId: 't.nope',
        },
        { log: mockLog }
      )
    ).rejects.toThrow(/Tab "t.nope" not found/);

    expect(mockExecuteBatchUpdate).not.toHaveBeenCalled();
  });

  it('applies a linkHeading style using the resolved tabId for both the range and the fallback link target', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute(
      {
        documentId: 'doc1',
        target: { startIndex: 1, endIndex: 5 },
        style: { linkHeading: { headingId: 'h.abc123' } },
      },
      { log: mockLog }
    );

    const request = mockExecuteBatchUpdate.mock.calls[0][2][0];
    expect(request.updateTextStyle?.textStyle?.link).toEqual({
      heading: { id: 'h.abc123', tabId: 't.first' },
    });
  });

  it('resolves textToFind against the explicitly requested tab', async () => {
    const mockDocs = {
      documents: {
        get: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              tabs: [
                { tabProperties: { tabId: 't.first' } },
                { tabProperties: { tabId: 't.second' } },
              ],
            },
          })
          .mockResolvedValueOnce({
            data: {
              tabs: [
                {
                  tabProperties: { tabId: 't.second' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          startIndex: 1,
                          endIndex: 13,
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: 13,
                                textRun: { content: 'hello world\n' },
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
          }),
      },
    };
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      {
        documentId: 'doc1',
        target: { textToFind: 'hello', matchInstance: 1 },
        style: { bold: true },
        tabId: 't.second',
      },
      { log: mockLog }
    );

    expect(result).toContain('t.second');
    const request = mockExecuteBatchUpdate.mock.calls[0][2][0];
    expect(request.updateTextStyle?.range?.tabId).toBe('t.second');
  });
});
