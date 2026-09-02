import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    executeBatchUpdateWithSplitting: vi.fn(),
  };
});

vi.mock('./tableRowDataHelpers.js', () => ({
  replaceTableRowData: vi.fn(),
}));

import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { register } from './appendDocTableRows.js';

const mockGetDocsClient = vi.mocked(getDocsClient);
const mockExecuteBatchUpdateWithSplitting = vi.mocked(GDocsHelpers.executeBatchUpdateWithSplitting);

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

function tabbedDocWithOneRowTable() {
  return {
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
  };
}

describe('appendDocTableRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('appends a row on a document with a single (legacy/synthetic) tab', async () => {
    const get = vi.fn().mockResolvedValue({ data: tabbedDocWithOneRowTable() });
    mockGetDocsClient.mockResolvedValue({ documents: { get } } as any);
    mockExecuteBatchUpdateWithSplitting.mockResolvedValue(undefined as any);

    const result = await toolExecute(
      { documentId: 'doc1', tableId: 'table:body:0', rows: [['a']] },
      { log: mockLog }
    );

    expect(result).toContain('Successfully appended');
  });

  it('never requests the top-level legacy body field alongside tabs on any of its documents.get calls', async () => {
    const get = vi.fn().mockResolvedValue({ data: tabbedDocWithOneRowTable() });
    mockGetDocsClient.mockResolvedValue({ documents: { get } } as any);
    mockExecuteBatchUpdateWithSplitting.mockResolvedValue(undefined as any);

    await toolExecute(
      { documentId: 'doc1', tableId: 'table:body:0', rows: [['a']] },
      { log: mockLog }
    );

    expect(get.mock.calls.length).toBeGreaterThan(0);
    for (const [callArgs] of get.mock.calls) {
      expect(callArgs.includeTabsContent).toBe(true);
      expect(callArgs.fields).not.toMatch(/^body\(|,body\(/);
      expect(callArgs.fields).toMatch(/^tabs\(/);
    }
  });
});
