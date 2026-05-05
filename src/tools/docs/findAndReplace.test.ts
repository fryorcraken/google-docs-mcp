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

const mockExecuteBatchUpdate = vi.mocked(GDocsHelpers.executeBatchUpdate);
const mockGetDocsClient = vi.mocked(getDocsClient);

// We test findAndReplace by registering it on a minimal FastMCP-like object
// and then invoking the execute handler directly.
// Simpler: import register() and capture the tool config.
import { register } from './findAndReplace.js';

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

describe('findAndReplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocsClient.mockResolvedValue({} as any);
    captureToolExecute();
  });

  it('should build the correct replaceAllText request with defaults', async () => {
    mockExecuteBatchUpdate.mockResolvedValue({
      replies: [{ replaceAllText: { occurrencesChanged: 2 } }],
    });

    const result = await toolExecute(
      { documentId: 'doc1', findText: 'old', replaceText: 'new' },
      { log: mockLog }
    );

    expect(mockExecuteBatchUpdate).toHaveBeenCalledOnce();
    const [, docId, requests] = mockExecuteBatchUpdate.mock.calls[0];
    expect(docId).toBe('doc1');
    expect(requests).toHaveLength(1);

    const req = requests[0].replaceAllText!;
    expect(req.containsText!.text).toBe('old');
    expect(req.containsText!.matchCase).toBe(false);
    expect(req.replaceText).toBe('new');
    expect(req.tabsCriteria).toBeUndefined();

    expect(result).toBe('Replaced 2 occurrence(s) of "old" with "new".');
  });

  it('should pass matchCase: true when explicitly set', async () => {
    mockExecuteBatchUpdate.mockResolvedValue({
      replies: [{ replaceAllText: { occurrencesChanged: 1 } }],
    });

    await toolExecute(
      { documentId: 'doc1', findText: 'Hello', replaceText: 'hi', matchCase: true },
      { log: mockLog }
    );

    const req = mockExecuteBatchUpdate.mock.calls[0][2][0].replaceAllText!;
    expect(req.containsText!.matchCase).toBe(true);
  });

  it('should pass empty string as replaceText for deletion', async () => {
    mockExecuteBatchUpdate.mockResolvedValue({
      replies: [{ replaceAllText: { occurrencesChanged: 5 } }],
    });

    const result = await toolExecute(
      { documentId: 'doc1', findText: 'remove me', replaceText: '' },
      { log: mockLog }
    );

    const req = mockExecuteBatchUpdate.mock.calls[0][2][0].replaceAllText!;
    expect(req.replaceText).toBe('');
    expect(result).toBe('Replaced 5 occurrence(s) of "remove me" with "".');
  });

  it('should include tabsCriteria with tabIds array when tabId is provided', async () => {
    mockExecuteBatchUpdate.mockResolvedValue({
      replies: [{ replaceAllText: { occurrencesChanged: 1 } }],
    });

    await toolExecute(
      { documentId: 'doc1', findText: 'a', replaceText: 'b', tabId: 'tab1' },
      { log: mockLog }
    );

    const req = mockExecuteBatchUpdate.mock.calls[0][2][0].replaceAllText!;
    expect(req.tabsCriteria).toEqual({ tabIds: ['tab1'] });
  });

  it('should not include tabsCriteria when tabId is omitted', async () => {
    mockExecuteBatchUpdate.mockResolvedValue({
      replies: [{ replaceAllText: { occurrencesChanged: 0 } }],
    });

    await toolExecute({ documentId: 'doc1', findText: 'a', replaceText: 'b' }, { log: mockLog });

    const req = mockExecuteBatchUpdate.mock.calls[0][2][0].replaceAllText!;
    expect(req.tabsCriteria).toBeUndefined();
  });

  it('should default occurrencesChanged to 0 when API returns null', async () => {
    mockExecuteBatchUpdate.mockResolvedValue({
      replies: [{ replaceAllText: { occurrencesChanged: null } }],
    });

    const result = await toolExecute(
      { documentId: 'doc1', findText: 'x', replaceText: 'y' },
      { log: mockLog }
    );

    expect(result).toBe('Replaced 0 occurrence(s) of "x" with "y".');
  });
});
