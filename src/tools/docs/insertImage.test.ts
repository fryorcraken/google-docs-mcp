import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
  getDriveClient: vi.fn(),
  getScriptClient: vi.fn(),
}));

vi.mock('../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    insertInlineImage: vi.fn(),
  };
});

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { register } from './insertImage.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockInsertInlineImage = vi.mocked(GDocsHelpers.insertInlineImage);

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

describe('insertImage — tab propagation (public URL path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('forwards auto-detected first-tab ID into insertInlineImage on tabbed docs', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' } }, { tabProperties: { tabId: 't.second' } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', imageUrl: 'https://example.com/x.png', index: 5 },
      { log: mockLog }
    );

    expect(result).toContain('t.first');
    expect(mockInsertInlineImage).toHaveBeenCalledOnce();
    // Last positional arg of insertInlineImage is the tabId.
    const callArgs = mockInsertInlineImage.mock.calls[0];
    expect(callArgs[callArgs.length - 1]).toBe('t.first');
  });

  it('passes undefined tabId for non-tabbed docs', async () => {
    const mockDocs = makeMockDocs({});
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute(
      { documentId: 'doc1', imageUrl: 'https://example.com/x.png', index: 5 },
      { log: mockLog }
    );

    const callArgs = mockInsertInlineImage.mock.calls[0];
    expect(callArgs[callArgs.length - 1]).toBeUndefined();
  });
});
