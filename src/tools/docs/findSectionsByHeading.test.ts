import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getDocsClient: vi.fn(),
}));

import { getDocsClient } from '../../clients.js';
import { register } from './findSectionsByHeading.js';

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

describe('findSectionsByHeading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureToolExecute();
  });

  it('finds a heading section on a document with a single (legacy/synthetic) tab', async () => {
    // Regression: includeTabsContent: true always populates `tabs`, even for
    // a document that predates the tabs feature — a real documents.get
    // response never has top-level `body` populated alongside `tabs` here,
    // since the tool's mask no longer requests it.
    const mockDocs = makeMockDocs({
      tabs: [
        {
          tabProperties: { tabId: 't.only' },
          documentTab: {
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 10,
                  paragraph: {
                    paragraphStyle: { namedStyleType: 'HEADING_1', headingId: 'h.abc' },
                    elements: [{ textRun: { content: 'Setup\n' } }],
                  },
                },
              ],
            },
          },
        },
      ],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    const result = await toolExecute({ documentId: 'doc1', headings: ['Setup'] }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.sections).toEqual([
      {
        headingText: 'Setup',
        headingLevel: 'HEADING_1',
        startIndex: 1,
        endIndex: 10,
        headingId: 'h.abc',
      },
    ]);
  });

  it('never requests the top-level legacy body field alongside tabs (would be rejected by the real API)', async () => {
    const mockDocs = makeMockDocs({
      tabs: [{ tabProperties: { tabId: 't.first' }, documentTab: { body: { content: [] } } }],
    });
    mockGetDocsClient.mockResolvedValue(mockDocs as any);

    await toolExecute({ documentId: 'doc1', headings: ['Setup'] }, { log: mockLog });

    const callArgs = mockDocs.documents.get.mock.calls[0][0];
    expect(callArgs.includeTabsContent).toBe(true);
    expect(callArgs.fields).not.toMatch(/^body\(|,body\(/);
    expect(callArgs.fields).toMatch(/^tabs\(/);
  });
});
