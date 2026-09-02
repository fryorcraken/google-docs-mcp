import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

import { getDocsClient } from '../../clients.js';
import { register } from './getTableStructure.js';

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

describe('getTableStructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('returns table structure on a document with a single (legacy/synthetic) tab', async () => {
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.only' },
          documentTab: {
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 20,
                  table: {
                    tableRows: [{ tableCells: [{ startIndex: 2, endIndex: 5, content: [] }] }],
                  },
                },
              ],
            },
          },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute(
      { documentId: 'doc1', tableId: 'table:body:0' },
      { log: mockLog }
    );
    const parsed = JSON.parse(result);

    expect(parsed.tableId).toBe('table:body:0');
  });

  it('never requests the top-level legacy body field alongside tabs (would be rejected by the real API)', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' }, documentTab: { body: { content: [] } } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await expect(
      toolExecute({ documentId: 'doc1', tableId: 'table:t.first:0' }, { log: mockLog })
    ).rejects.toThrow(/not found/);

    const callArgs = mockDocs.documents.get.mock.calls[0][0];
    expect(callArgs.includeTabsContent).toBe(true);
    expect(callArgs.fields).not.toMatch(/^body\(|,body\(/);
    expect(callArgs.fields).toMatch(/^tabs\(/);
  });
});
