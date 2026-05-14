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
import { register } from './updateParagraphBullets.js';

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

describe('updateParagraphBullets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('sends deleteParagraphBullets when action=remove with a range target', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);

    const result = await toolExecute(
      {
        documentId: 'doc1',
        action: 'remove',
        target: { startIndex: 10, endIndex: 20 },
      },
      { log: mockLog }
    );

    expect(result).toMatch(/Removed bullets/);
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteParagraphBullets).toBeDefined();
    expect(requests[0].deleteParagraphBullets?.range?.startIndex).toBe(10);
    expect(requests[0].deleteParagraphBullets?.range?.endIndex).toBe(20);
  });

  it('sends createParagraphBullets with the chosen preset when action=set', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);

    await toolExecute(
      {
        documentId: 'doc1',
        action: 'set',
        bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
        target: { startIndex: 5, endIndex: 8 },
      },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].createParagraphBullets?.bulletPreset).toBe('BULLET_DISC_CIRCLE_SQUARE');
    expect(requests[0].createParagraphBullets?.range?.startIndex).toBe(5);
  });

  it('includes tabId in the range when operating on a tabbed doc', async () => {
    mockGetDocsClient.mockResolvedValue(
      makeMockDocs({ tabs: [{ tabProperties: { tabId: 't.only' } }] }) as any
    );

    await toolExecute(
      {
        documentId: 'doc1',
        action: 'remove',
        target: { startIndex: 1, endIndex: 5 },
      },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteParagraphBullets?.range?.tabId).toBe('t.only');
  });

  it('snaps a textToFind target to the containing paragraph range', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 25, endIndex: 35 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 20, endIndex: 50 });

    await toolExecute(
      {
        documentId: 'doc1',
        action: 'remove',
        target: { textToFind: 'Hello' },
      },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteParagraphBullets?.range?.startIndex).toBe(20);
    expect(requests[0].deleteParagraphBullets?.range?.endIndex).toBe(50);
  });

  it('snaps an indexWithinParagraph target to the containing paragraph range', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockGetParagraphRange.mockResolvedValue({ startIndex: 100, endIndex: 130 });

    await toolExecute(
      {
        documentId: 'doc1',
        action: 'remove',
        target: { indexWithinParagraph: 115 },
      },
      { log: mockLog }
    );

    expect(mockGetParagraphRange).toHaveBeenCalledWith(expect.anything(), 'doc1', 115, undefined);
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteParagraphBullets?.range?.startIndex).toBe(100);
  });

  it('rejects action=set without a bulletPreset', () => {
    // The Zod schema enforces this — try registering the tool and
    // ensuring the parameters schema rejects this combination.
    // Easier path: invoke and catch the validation error inside execute
    // (the FastMCP layer validates before execute runs in production,
    // but the Zod refine here is what we want to test).
    const fakeServer: { params?: any } = {};
    register({
      addTool: (config: any) => {
        fakeServer.params = config.parameters;
      },
    } as any);
    const result = fakeServer.params.safeParse({
      documentId: 'doc1',
      action: 'set',
      target: { startIndex: 1, endIndex: 5 },
    });
    expect(result.success).toBe(false);
  });
});
