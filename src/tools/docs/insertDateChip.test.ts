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
import { register } from './insertDateChip.js';

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

describe('insertDateChip — tab handling (issue #1, Category B field-mask fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('inserts into first tab when no tabId on tabbed doc', async () => {
    // Regression: previously the field mask `tabs(tabProperties,documentTab)`
    // dropped body content needed for chip insertion AND the tabbed-no-tabId
    // path silently inserted at body location which fails on tabbed docs.
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.second' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', index: 5, date: '2026-05-07' },
      { log: mockLog }
    );

    expect(result).toContain('t.first');
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertDate?.location?.tabId).toBe('t.first');
    expect(requests[0].insertDate?.location?.index).toBe(5);
  });

  it('passes through explicit tabId', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.target' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute(
      { documentId: 'doc1', index: 5, date: '2026-05-07', tabId: 't.target' },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertDate?.location?.tabId).toBe('t.target');
  });

  it('omits tabId from location for non-tabbed docs', async () => {
    const mockDocs = makeMockDocs({}); // no tabs
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1', index: 5, date: '2026-05-07' }, { log: mockLog });

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertDate?.location?.tabId).toBeUndefined();
    expect(requests[0].insertDate?.location?.index).toBe(5);
  });

  it('rejects with clear error when explicit tabId does not exist', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await expect(
      toolExecute(
        { documentId: 'doc1', index: 5, date: '2026-05-07', tabId: 't.nope' },
        { log: mockLog }
      )
    ).rejects.toThrow(/Tab "t.nope" not found/);
  });
});
