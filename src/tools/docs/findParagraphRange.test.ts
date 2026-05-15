import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    findTextRange: vi.fn(),
    getParagraphRange: vi.fn(),
  };
});

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { register } from './findParagraphRange.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockFindTextRange = vi.mocked(GDocsHelpers.findTextRange);
const mockGetParagraphRange = vi.mocked(GDocsHelpers.getParagraphRange);

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

describe('findParagraphRange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('returns the paragraph range when targeting by text', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 45, endIndex: 75 });

    const result = await toolExecute(
      { documentId: 'doc1', target: { textToFind: 'foo' } },
      { log: mockLog }
    );

    expect(JSON.parse(result)).toEqual({ startIndex: 45, endIndex: 75, tabId: null });
  });

  it('returns the paragraph range when targeting by index', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockGetParagraphRange.mockResolvedValue({ startIndex: 100, endIndex: 130 });

    const result = await toolExecute(
      { documentId: 'doc1', target: { indexWithinParagraph: 115 } },
      { log: mockLog }
    );

    expect(JSON.parse(result)).toEqual({ startIndex: 100, endIndex: 130, tabId: null });
    expect(mockGetParagraphRange).toHaveBeenCalledWith(expect.anything(), 'doc1', 115, undefined);
    expect(mockFindTextRange).not.toHaveBeenCalled();
  });

  it('includes tabId in the response when operating on a tabbed doc', async () => {
    mockGetDocsClient.mockResolvedValue(
      makeMockDocs({ tabs: [{ tabProperties: { tabId: 't.first' } }] }) as any
    );
    mockGetParagraphRange.mockResolvedValue({ startIndex: 10, endIndex: 20 });

    const result = await toolExecute(
      { documentId: 'doc1', target: { indexWithinParagraph: 15 } },
      { log: mockLog }
    );

    expect(JSON.parse(result)).toEqual({ startIndex: 10, endIndex: 20, tabId: 't.first' });
  });

  it('throws when text cannot be found', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue(null);

    await expect(
      toolExecute({ documentId: 'doc1', target: { textToFind: 'nope' } }, { log: mockLog })
    ).rejects.toThrow(/Could not find "nope"/);
  });
});
