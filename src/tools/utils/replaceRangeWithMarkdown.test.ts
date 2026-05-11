import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    executeBatchUpdate: vi.fn(),
    findTextRange: vi.fn(),
  };
});

vi.mock('../../markdown-transformer/index.js', () => ({
  insertMarkdown: vi.fn(),
  formatInsertResult: vi.fn().mockReturnValue('insert-summary'),
}));

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { insertMarkdown } from '../../markdown-transformer/index.js';
import { register } from './replaceRangeWithMarkdown.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockExecuteBatchUpdate = vi.mocked(GDocsHelpers.executeBatchUpdate);
const mockFindTextRange = vi.mocked(GDocsHelpers.findTextRange);
const mockInsertMarkdown = vi.mocked(insertMarkdown);

let toolExecute: (args: any, context: any) => Promise<string>;
let toolParameters: any;

function captureTool() {
  const fakeServer = {
    addTool: (config: any) => {
      toolExecute = config.execute;
      toolParameters = config.parameters;
    },
  };
  register(fakeServer as any);
}

const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

function makeMockDocs(getResponse: any) {
  return {
    documents: {
      get: vi.fn().mockResolvedValue({ data: getResponse }),
    },
  };
}

const FAKE_INSERT_RESULT = {
  totalRequests: 1,
  requestsByType: { insertText: 1 },
  parseElapsedMs: 1,
  batchUpdate: {
    totalRequests: 1,
    phases: {
      delete: { requests: 0, apiCalls: 0, elapsedMs: 0 },
      insert: { requests: 1, apiCalls: 1, elapsedMs: 1 },
      format: { requests: 0, apiCalls: 0, elapsedMs: 0 },
    },
    totalApiCalls: 1,
    totalElapsedMs: 1,
  },
  totalElapsedMs: 2,
};

describe('replaceRangeWithMarkdown — schema validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureTool();
  });

  it('rejects when neither targeting mode is provided', () => {
    const result = toolParameters.safeParse({ documentId: 'd', markdown: 'x' });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/exactly one targeting mode/);
  });

  it('rejects when both targeting modes are provided', () => {
    const result = toolParameters.safeParse({
      documentId: 'd',
      markdown: 'x',
      startIndex: 1,
      endIndex: 10,
      textToFind: 'foo',
    });
    expect(result.success).toBe(false);
  });

  it('accepts range targeting', () => {
    const result = toolParameters.safeParse({
      documentId: 'd',
      markdown: 'x',
      startIndex: 1,
      endIndex: 10,
    });
    expect(result.success).toBe(true);
  });

  it('accepts text-find targeting', () => {
    const result = toolParameters.safeParse({
      documentId: 'd',
      markdown: 'x',
      textToFind: 'foo',
    });
    expect(result.success).toBe(true);
  });
});

describe('replaceRangeWithMarkdown — range targeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureTool();
    mockInsertMarkdown.mockResolvedValue(FAKE_INSERT_RESULT);
  });

  it('deletes the explicit range and inserts markdown for a non-tabbed doc', async () => {
    const mockDocs = makeMockDocs({}); // no tabs
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', markdown: '# Hello', startIndex: 10, endIndex: 20 },
      { log: mockLog }
    );

    expect(result).toContain('Successfully replaced range 10-20');
    expect(mockExecuteBatchUpdate).toHaveBeenCalledOnce();
    const deleteCall = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(deleteCall[0]).toEqual({
      deleteContentRange: { range: { startIndex: 10, endIndex: 20 } },
    });
    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      mockDocs,
      'doc1',
      '# Hello',
      expect.objectContaining({ startIndex: 10, tabId: undefined })
    );
  });

  it('auto-detects tabbed doc and passes tabId through to delete and insert', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.second' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute(
      { documentId: 'doc1', markdown: '# Hi', startIndex: 5, endIndex: 15 },
      { log: mockLog }
    );

    const deleteCall = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(deleteCall[0].deleteContentRange?.range?.tabId).toBe('t.first');
    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      mockDocs,
      'doc1',
      '# Hi',
      expect.objectContaining({ startIndex: 5, tabId: 't.first' })
    );
  });

  it('respects explicit tabId when provided', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.target' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute(
      {
        documentId: 'doc1',
        markdown: 'x',
        startIndex: 5,
        endIndex: 15,
        tabId: 't.target',
      },
      { log: mockLog }
    );

    const deleteCall = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(deleteCall[0].deleteContentRange?.range?.tabId).toBe('t.target');
    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      mockDocs,
      'doc1',
      'x',
      expect.objectContaining({ startIndex: 5, tabId: 't.target' })
    );
  });

  it('rejects endIndex <= startIndex at runtime', async () => {
    // Note: zod doesn't enforce this — handled by execute() to give a
    // nicer UserError message.
    const mockDocs = makeMockDocs({});
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await expect(
      toolExecute(
        { documentId: 'doc1', markdown: 'x', startIndex: 10, endIndex: 10 },
        { log: mockLog }
      )
    ).rejects.toThrow(/endIndex must be greater/);
  });

  it('passes firstHeadingAsTitle through to insertMarkdown', async () => {
    const mockDocs = makeMockDocs({});
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute(
      {
        documentId: 'doc1',
        markdown: '# Title',
        startIndex: 1,
        endIndex: 2,
        firstHeadingAsTitle: true,
      },
      { log: mockLog }
    );

    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      mockDocs,
      'doc1',
      '# Title',
      expect.objectContaining({ firstHeadingAsTitle: true })
    );
  });
});

describe('replaceRangeWithMarkdown — text-find targeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureTool();
    mockInsertMarkdown.mockResolvedValue(FAKE_INSERT_RESULT);
  });

  it('resolves textToFind to a range and uses it for delete + insert', async () => {
    const mockDocs = makeMockDocs({});
    mockGetDocsClient.mockResolvedValue(mockDocs as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 42, endIndex: 50 });

    const result = await toolExecute(
      { documentId: 'doc1', markdown: 'new', textToFind: 'old' },
      { log: mockLog }
    );

    expect(mockFindTextRange).toHaveBeenCalledWith(mockDocs, 'doc1', 'old', 1, undefined);
    expect(result).toContain('Successfully replaced range 42-50');
    const deleteCall = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(deleteCall[0].deleteContentRange?.range).toEqual({ startIndex: 42, endIndex: 50 });
  });

  it('uses matchInstance to disambiguate when the text appears multiple times', async () => {
    const mockDocs = makeMockDocs({});
    mockGetDocsClient.mockResolvedValue(mockDocs as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 100, endIndex: 105 });

    await toolExecute(
      { documentId: 'doc1', markdown: 'x', textToFind: 'foo', matchInstance: 3 },
      { log: mockLog }
    );

    expect(mockFindTextRange).toHaveBeenCalledWith(mockDocs, 'doc1', 'foo', 3, undefined);
  });

  it('passes resolved tabId to findTextRange on tabbed docs', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.alpha' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 5, endIndex: 10 });

    await toolExecute({ documentId: 'doc1', markdown: 'x', textToFind: 'foo' }, { log: mockLog });

    expect(mockFindTextRange).toHaveBeenCalledWith(mockDocs, 'doc1', 'foo', 1, 't.alpha');
  });

  it('throws a clear UserError when textToFind is not found', async () => {
    const mockDocs = makeMockDocs({});
    mockGetDocsClient.mockResolvedValue(mockDocs as any);
    mockFindTextRange.mockResolvedValue(null);

    await expect(
      toolExecute({ documentId: 'doc1', markdown: 'x', textToFind: 'missing' }, { log: mockLog })
    ).rejects.toThrow(/Could not find text "missing"/);
    expect(mockExecuteBatchUpdate).not.toHaveBeenCalled();
    expect(mockInsertMarkdown).not.toHaveBeenCalled();
  });
});
