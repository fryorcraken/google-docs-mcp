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
import { register } from './unbulletParagraph.js';

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

describe('unbulletParagraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('bundles deleteParagraphBullets + updateParagraphStyle + updateTextStyle in one batch (no prefix)', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 45, endIndex: 75 });

    await toolExecute({ documentId: 'doc1', target: { textToFind: 'foo' } }, { log: mockLog });

    expect(mockExecuteBatchUpdate).toHaveBeenCalledTimes(1);
    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests).toHaveLength(3);
    expect(requests[0].deleteParagraphBullets?.range).toMatchObject({
      startIndex: 45,
      endIndex: 75,
    });
    expect(requests[1].updateParagraphStyle?.paragraphStyle?.namedStyleType).toBe('NORMAL_TEXT');
    expect(requests[2].updateTextStyle?.textStyle).toMatchObject({
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      link: {},
    });
  });

  it('honors a custom namedStyleType', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 45, endIndex: 75 });

    await toolExecute(
      {
        documentId: 'doc1',
        target: { textToFind: 'foo' },
        namedStyleType: 'HEADING_3',
      },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[1].updateParagraphStyle?.paragraphStyle?.namedStyleType).toBe('HEADING_3');
  });

  it('omits the updateTextStyle request when clearInlineStyles is false', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 45, endIndex: 75 });

    await toolExecute(
      { documentId: 'doc1', target: { textToFind: 'foo' }, clearInlineStyles: false },
      { log: mockLog }
    );

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests).toHaveLength(2);
    expect(requests.find((r: any) => r.updateTextStyle)).toBeUndefined();
  });

  it('strips the prefix in a separate batch and re-resolves the paragraph before styling', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    // First findTextRange resolves the target text inside the paragraph.
    // Second findTextRange validates the stripPrefix anchors at paragraph start.
    mockFindTextRange
      .mockResolvedValueOnce({ startIndex: 100, endIndex: 110 })
      .mockResolvedValueOnce({ startIndex: 90, endIndex: 99 });
    // First getParagraphRange (before strip), second (after strip — shrunk).
    mockGetParagraphRange
      .mockResolvedValueOnce({ startIndex: 90, endIndex: 130 })
      .mockResolvedValueOnce({ startIndex: 90, endIndex: 121 });

    await toolExecute(
      {
        documentId: 'doc1',
        target: { textToFind: 'Action' },
        stripPrefix: 'Details: ',
      },
      { log: mockLog }
    );

    expect(mockExecuteBatchUpdate).toHaveBeenCalledTimes(2);
    // First batch: deleteContentRange [90, 99) (length 9, "Details: ")
    const firstBatch = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch[0].deleteContentRange?.range).toMatchObject({ startIndex: 90, endIndex: 99 });
    // Second batch styles the re-resolved range [90, 121).
    const secondBatch = mockExecuteBatchUpdate.mock.calls[1][2];
    expect(secondBatch[0].deleteParagraphBullets?.range).toMatchObject({
      startIndex: 90,
      endIndex: 121,
    });
  });

  it('rejects a stripPrefix that does not anchor at paragraph start', async () => {
    mockGetDocsClient.mockResolvedValue(makeMockDocs({}) as any);
    mockFindTextRange
      .mockResolvedValueOnce({ startIndex: 100, endIndex: 110 })
      // stripPrefix found, but at a different index — does not anchor at paragraph start.
      .mockResolvedValueOnce({ startIndex: 200, endIndex: 209 });
    mockGetParagraphRange.mockResolvedValueOnce({ startIndex: 90, endIndex: 130 });

    await expect(
      toolExecute(
        {
          documentId: 'doc1',
          target: { textToFind: 'Action' },
          stripPrefix: 'Details: ',
        },
        { log: mockLog }
      )
    ).rejects.toThrow(/does not match the start/);
    expect(mockExecuteBatchUpdate).not.toHaveBeenCalled();
  });

  it('propagates tabId into every range', async () => {
    mockGetDocsClient.mockResolvedValue(
      makeMockDocs({ tabs: [{ tabProperties: { tabId: 't.only' } }] }) as any
    );
    mockFindTextRange.mockResolvedValue({ startIndex: 50, endIndex: 60 });
    mockGetParagraphRange.mockResolvedValue({ startIndex: 45, endIndex: 75 });

    await toolExecute({ documentId: 'doc1', target: { textToFind: 'foo' } }, { log: mockLog });

    const requests = mockExecuteBatchUpdate.mock.calls[0][2];
    expect(requests[0].deleteParagraphBullets?.range?.tabId).toBe('t.only');
    expect(requests[1].updateParagraphStyle?.range?.tabId).toBe('t.only');
    expect(requests[2].updateTextStyle?.range?.tabId).toBe('t.only');
  });
});
