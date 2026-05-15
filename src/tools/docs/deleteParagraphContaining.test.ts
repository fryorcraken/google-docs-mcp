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
    getParagraphRange: vi.fn(),
  };
});

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { register } from './deleteParagraphContaining.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockExecuteBatchUpdate = vi.mocked(GDocsHelpers.executeBatchUpdate);
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

describe('deleteParagraphContaining', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('deletes the full paragraph range, not just the matched text range', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 45, endIndex: 75 });

    const result = await toolExecute(
      { documentId: 'doc1', textToFind: 'TODO: revisit' },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteContentRange?.range?.startIndex).toBe(45);
    expect(requests[0].deleteContentRange?.range?.endIndex).toBe(75);
    expect(result).toMatch(/Deleted paragraph at 45-75/);
  });

  it('passes matchInstance through to findTextRange', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 100, endIndex: 110 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 95, endIndex: 120 });

    await toolExecute(
      { documentId: 'doc1', textToFind: 'foo', matchInstance: 3 },
      { log: mockLog }
    );

    expect(mockFindTextRange).toHaveBeenCalledWith(expect.anything(), 'doc1', 'foo', 3, undefined);
  });

  it('propagates tabId into the delete range', async () => {
    mockGetDocsClient.mockResolvedValue(
      makeMockDocs({ tabs: [{ tabProperties: { tabId: 't.only' } }] }) as any
    );
    mockFindTextRange.mockResolvedValue({ startIndex: 10, endIndex: 20 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 5, endIndex: 30 });

    await toolExecute({ documentId: 'doc1', textToFind: 'foo' }, { log: mockLog });

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteContentRange?.range?.tabId).toBe('t.only');
  });

  it('throws UserError when textToFind cannot be located', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue(null);

    await expect(
      toolExecute({ documentId: 'doc1', textToFind: 'absent' }, { log: mockLog })
    ).rejects.toThrow(/Could not find "absent"/);
  });

  it('throws UserError when paragraph boundary cannot be resolved', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue(null);

    await expect(
      toolExecute({ documentId: 'doc1', textToFind: 'foo' }, { log: mockLog })
    ).rejects.toThrow(/could not locate its paragraph boundaries/);
  });
});
