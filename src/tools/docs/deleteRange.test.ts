import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    executeBatchUpdate: vi.fn(),
  };
});

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { register } from './deleteRange.js';

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

describe('deleteRange — tab handling (issue #1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('deletes from first tab when no tabId on tabbed doc', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.second' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', startIndex: 5, endIndex: 10 },
      { log: mockLog }
    );

    expect(result).toContain('t.first');
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteContentRange?.range?.tabId).toBe('t.first');
    expect(requests[0].deleteContentRange?.range?.startIndex).toBe(5);
    expect(requests[0].deleteContentRange?.range?.endIndex).toBe(10);
  });

  it('omits tabId from range for non-tabbed docs', async () => {
    const mockDocs = makeMockDocs({});
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1', startIndex: 5, endIndex: 10 }, { log: mockLog });

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteContentRange?.range?.tabId).toBeUndefined();
  });
});
