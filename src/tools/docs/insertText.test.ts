import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    executeBatchUpdate: vi.fn(),
    insertText: vi.fn(),
  };
});

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { register } from './insertText.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockExecuteBatchUpdate = vi.mocked(GDocsHelpers.executeBatchUpdate);
const mockInsertTextHelper = vi.mocked(GDocsHelpers.insertText);

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

describe('insertText — tab handling (issue #1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('inserts into first tab when tabbed doc has no tabId arg', async () => {
    // Regression: previously this fell through to the legacy path which
    // called Docs API without tabId, failing on tabbed docs.
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.second' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', text: 'hello', index: 5 },
      { log: mockLog }
    );

    expect(result).toContain('t.first');
    expect(mockExecuteBatchUpdate).toHaveBeenCalledOnce();
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertText?.location?.tabId).toBe('t.first');
    expect(requests[0].insertText?.location?.index).toBe(5);
    // Legacy helper must NOT be called for tabbed docs.
    expect(mockInsertTextHelper).not.toHaveBeenCalled();
  });

  it('inserts into the explicit tab when tabId is supplied', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.target' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', text: 'hello', index: 5, tabId: 't.target' },
      { log: mockLog }
    );

    expect(result).toContain('t.target');
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertText?.location?.tabId).toBe('t.target');
  });

  it('uses legacy helper for non-tabbed docs (no behavior change)', async () => {
    const mockDocs = makeMockDocs({}); // no tabs field
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1', text: 'hello', index: 5 }, { log: mockLog });

    expect(mockInsertTextHelper).toHaveBeenCalledOnce();
    expect(mockInsertTextHelper).toHaveBeenCalledWith(mockDocs, 'doc1', 'hello', 5);
    expect(mockExecuteBatchUpdate).not.toHaveBeenCalled();
  });

  it('rejects with a clear error when explicit tabId does not exist', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await expect(
      toolExecute(
        { documentId: 'doc1', text: 'hello', index: 5, tabId: 't.nope' },
        { log: mockLog }
      )
    ).rejects.toThrow(/Tab "t.nope" not found/);
  });
});
