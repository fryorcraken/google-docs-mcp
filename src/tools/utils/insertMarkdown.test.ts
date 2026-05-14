import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    findTextRange: vi.fn(),
  };
});

vi.mock('../../markdown-transformer/index.js', () => ({
  insertMarkdown: vi.fn(),
  formatInsertResult: vi.fn().mockReturnValue('insert-summary'),
}));

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { insertMarkdown as insertMarkdownFn } from '../../markdown-transformer/index.js';
import { register } from './insertMarkdown.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockFindTextRange = vi.mocked(GDocsHelpers.findTextRange);
const mockInsertMarkdown = vi.mocked(insertMarkdownFn);

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

describe('insertMarkdown — schema validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureTool();
  });

  it('accepts index targeting', () => {
    const result = toolParameters.safeParse({
      documentId: 'd',
      markdown: '# x',
      target: { index: 5 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts text+position targeting', () => {
    const result = toolParameters.safeParse({
      documentId: 'd',
      markdown: '# x',
      target: { textToFind: 'foo', position: 'after' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects text targeting without position', () => {
    const result = toolParameters.safeParse({
      documentId: 'd',
      markdown: '# x',
      target: { textToFind: 'foo' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty markdown', () => {
    const result = toolParameters.safeParse({
      documentId: 'd',
      markdown: '',
      target: { index: 1 },
    });
    expect(result.success).toBe(false);
  });
});

describe('insertMarkdown — execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureTool();
    mockInsertMarkdown.mockResolvedValue(FAKE_INSERT_RESULT as any);
  });

  it('inserts at the explicit index for a non-tabbed doc', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);

    const result = await toolExecute(
      { documentId: 'doc1', markdown: '# Hello', target: { index: 10 } },
      { log: mockLog }
    );

    expect(result).toMatch(/at index 10/);
    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      'doc1',
      '# Hello',
      expect.objectContaining({ startIndex: 10, tabId: undefined })
    );
  });

  it('uses the first tab when none specified on a tabbed doc', async () => {
    mockGetDocsClient.mockResolvedValue(
      makeMockDocs({ tabs: [{ tabProperties: { tabId: 't.first' } }] }) as any
    );

    await toolExecute(
      { documentId: 'doc1', markdown: '# x', target: { index: 1 } },
      { log: mockLog }
    );

    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      'doc1',
      '# x',
      expect.objectContaining({ tabId: 't.first' })
    );
  });

  it('anchors before matched text', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });

    await toolExecute(
      {
        documentId: 'doc1',
        markdown: '## New section',
        target: { textToFind: 'Anchor', position: 'before' },
      },
      { log: mockLog }
    );

    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      'doc1',
      '## New section',
      expect.objectContaining({ startIndex: 50 })
    );
  });

  it('anchors after matched text', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });

    await toolExecute(
      {
        documentId: 'doc1',
        markdown: '- new item',
        target: { textToFind: 'Anchor', position: 'after' },
      },
      { log: mockLog }
    );

    expect(mockInsertMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      'doc1',
      '- new item',
      expect.objectContaining({ startIndex: 60 })
    );
  });

  it('errors with a clear message when anchor text is not found', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue(null);

    await expect(
      toolExecute(
        {
          documentId: 'doc1',
          markdown: '# x',
          target: { textToFind: 'Missing', position: 'before' },
        },
        { log: mockLog }
      )
    ).rejects.toThrow(/Could not find text "Missing"/);
  });
});
