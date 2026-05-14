import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

vi.mock('../../../googleDocsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../googleDocsApiHelpers.js')>();
  return {
    ...actual,
    executeBatchUpdate: vi.fn(),
    findTextRange: vi.fn(),
    getParagraphRange: vi.fn(),
  };
});

import { getDocsClient } from '../../../clients.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';
import { register } from './addListItem.js';

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

function makeMockDocs(tabsResponse: any) {
  return {
    documents: {
      get: vi.fn().mockResolvedValue({ data: tabsResponse }),
    },
  };
}

describe('addListItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it("inserts `\\n<text>` just before the donor paragraph's trailing newline (text donor)", async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 45, endIndex: 65 });

    const result = await toolExecute(
      {
        documentId: 'doc1',
        donor: { textToFind: 'Ushiro geri' },
        text: 'Hiza geri (Knee strike)',
      },
      { log: mockLog }
    );

    expect(result).toMatch(/Added new list item after donor/);
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertText?.text).toBe('\nHiza geri (Knee strike)');
    // donor.endIndex = 65 → insert at 64 (just before trailing newline)
    expect(requests[0].insertText?.location?.index).toBe(64);
  });

  it('locates the donor paragraph from an index inside it', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockGetParagraphRange.mockResolvedValue({ startIndex: 100, endIndex: 130 });

    await toolExecute(
      {
        documentId: 'doc1',
        donor: { indexWithinDonor: 115 },
        text: 'New item',
      },
      { log: mockLog }
    );

    expect(mockGetParagraphRange).toHaveBeenCalledWith(expect.anything(), 'doc1', 115, undefined);
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertText?.location?.index).toBe(129);
  });

  it('includes tabId in the insertion Location when operating on a tabbed doc', async () => {
    mockGetDocsClient.mockResolvedValue(
      makeMockDocs({ tabs: [{ tabProperties: { tabId: 't.only' } }] }) as any
    );
    mockGetParagraphRange.mockResolvedValue({ startIndex: 10, endIndex: 20 });

    await toolExecute(
      {
        documentId: 'doc1',
        donor: { indexWithinDonor: 12 },
        text: 'New',
      },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].insertText?.location?.tabId).toBe('t.only');
  });

  it('errors clearly when the donor text cannot be found', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue(null);

    await expect(
      toolExecute(
        {
          documentId: 'doc1',
          donor: { textToFind: 'Nope' },
          text: 'x',
        },
        { log: mockLog }
      )
    ).rejects.toThrow(/Could not find donor text "Nope"/);
  });
});
