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
import { register } from './deleteTableRows.js';

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

describe('deleteTableRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('deletes a row on a document with a single (legacy/synthetic) tab', async () => {
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
                    tableRows: [
                      { tableCells: [{ startIndex: 2, endIndex: 5, content: [] }] },
                      { tableCells: [{ startIndex: 6, endIndex: 9, content: [] }] },
                    ],
                  },
                },
              ],
            },
          },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute(
      { documentId: 'doc1', tableId: 'table:body:0', rowStart: 0, rowCount: 1 },
      { log: mockLog }
    );

    expect(mockExecuteBatchUpdate).toHaveBeenCalledOnce();
  });

  it('never requests the top-level legacy body field alongside tabs (would be rejected by the real API)', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' }, documentTab: { body: { content: [] } } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await expect(
      toolExecute(
        { documentId: 'doc1', tableId: 'table:t.first:0', rowStart: 0, rowCount: 1 },
        { log: mockLog }
      )
    ).rejects.toThrow(/not found/);

    const callArgs = mockDocs.documents.get.mock.calls[0][0];
    expect(callArgs.includeTabsContent).toBe(true);
    expect(callArgs.fields).not.toMatch(/^body\(|,body\(/);
    expect(callArgs.fields).toMatch(/^tabs\(/);
  });
});
