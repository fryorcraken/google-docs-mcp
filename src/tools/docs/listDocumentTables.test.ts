import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

import { getDocsClient } from '../../clients.js';
import { register } from './listDocumentTables.js';

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

describe('listDocumentTables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('lists tables on a document with a single (legacy/synthetic) tab', async () => {
    // Regression: includeTabsContent: true always populates `tabs`, even for
    // a document that predates the tabs feature (it gets one synthetic tab)
    // — the real Docs API rejects a mask combining top-level `body` with
    // `tabs`, so a real documents.get response never has both populated.
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

    const result = await toolExecute({ documentId: 'doc1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.tables).toHaveLength(1);
  });

  it('never requests the top-level legacy body field alongside tabs (would be rejected by the real API)', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' }, documentTab: { body: { content: [] } } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1' }, { log: mockLog });

    const callArgs = mockDocs.documents.get.mock.calls[0][0];
    expect(callArgs.includeTabsContent).toBe(true);
    expect(callArgs.fields).not.toMatch(/^body\(|,body\(/);
    expect(callArgs.fields).toMatch(/^tabs\(/);
  });
});
