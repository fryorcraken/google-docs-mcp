import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getSlidesClient: vi.fn(),
}));

import { getSlidesClient } from '../../clients.js';
import { register as registerCreate } from './createPresentation.js';
import { register as registerRead } from './readPresentation.js';
import { register as registerList } from './listSlides.js';

const mockGetSlidesClient = vi.mocked(getSlidesClient);
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

function captureExecute(register: (server: any) => void) {
  let execute: (args: any, ctx: any) => Promise<string> = async () => '';
  register({ addTool: (config: any) => (execute = config.execute) });
  return execute;
}

describe('createPresentation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the presentationId and edit URL on success', async () => {
    const create = vi.fn().mockResolvedValue({
      data: { presentationId: 'pres123', title: 'My Deck' },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { create } } as any);

    const execute = captureExecute(registerCreate);
    const result = await execute({ title: 'My Deck' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.presentationId).toBe('pres123');
    expect(parsed.url).toBe('https://docs.google.com/presentation/d/pres123/edit');
    expect(create).toHaveBeenCalledWith({ requestBody: { title: 'My Deck' } });
  });

  it('translates a generic 403 to a scope-actionable message', async () => {
    const create = vi.fn().mockRejectedValue({ code: 403, message: 'forbidden' });
    mockGetSlidesClient.mockResolvedValue({ presentations: { create } } as any);

    const execute = captureExecute(registerCreate);
    await expect(execute({ title: 'X' }, { log: mockLog })).rejects.toThrow(
      /Permission denied.*presentations scope/
    );
  });

  it('translates accessNotConfigured 403 to "enable the Slides API" message', async () => {
    const create = vi.fn().mockRejectedValue({
      code: 403,
      message: 'Google Slides API has not been used in project 123 before...',
      errors: [{ reason: 'accessNotConfigured' }],
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { create } } as any);

    const execute = captureExecute(registerCreate);
    await expect(execute({ title: 'X' }, { log: mockLog })).rejects.toThrow(
      /Slides API is not enabled.*console\.cloud\.google\.com/
    );
  });

  it('does NOT wrap missing-presentationId in UserError (treated as invariant bug)', async () => {
    const create = vi.fn().mockResolvedValue({ data: {} });
    mockGetSlidesClient.mockResolvedValue({ presentations: { create } } as any);

    const execute = captureExecute(registerCreate);
    // Should throw a plain Error, not UserError — the API contract guarantees
    // presentationId on 200, so this is a server-side invariant.
    await expect(execute({ title: 'Empty' }, { log: mockLog })).rejects.toThrow(
      /200 with no presentationId/
    );
  });
});

describe('readPresentation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('extracts visible text per slide in text format', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        title: 'Demo',
        slides: [
          {
            objectId: 'slide_1',
            pageElements: [
              {
                shape: {
                  text: {
                    textElements: [{ textRun: { content: 'Hello world\n' } }],
                  },
                },
              },
            ],
          },
          {
            objectId: 'slide_2',
            pageElements: [],
          },
        ],
      },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    const result = await execute({ presentationId: 'p1', format: 'text' }, { log: mockLog });

    expect(result).toContain('Demo');
    expect(result).toContain('Slide 1');
    expect(result).toContain('Hello world');
    expect(result).toContain('Slide 2');
    expect(result).toContain('(no text content)');
  });

  it('returns full API payload in json format', async () => {
    const get = vi.fn().mockResolvedValue({ data: { title: 'X', slides: [] } });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    const result = await execute({ presentationId: 'p1', format: 'json' }, { log: mockLog });

    expect(JSON.parse(result)).toEqual({ title: 'X', slides: [] });
  });

  it('filters slides by slideObjectIds when provided', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        title: 'Big',
        slides: [
          { objectId: 'slide_1', pageElements: [] },
          { objectId: 'slide_2', pageElements: [] },
          { objectId: 'slide_3', pageElements: [] },
        ],
      },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    const result = await execute(
      { presentationId: 'p1', format: 'json', slideObjectIds: ['slide_2', 'slide_3'] },
      { log: mockLog }
    );
    const parsed = JSON.parse(result);

    expect(parsed.slides.map((s: any) => s.objectId)).toEqual(['slide_2', 'slide_3']);
  });

  it('applies slideObjectIds filter in text format too', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        title: 'Mixed',
        slides: [
          {
            objectId: 'slide_1',
            pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'A' } }] } } }],
          },
          {
            objectId: 'slide_2',
            pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'B' } }] } } }],
          },
        ],
      },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    const result = await execute(
      { presentationId: 'p1', format: 'text', slideObjectIds: ['slide_2'] },
      { log: mockLog }
    );

    expect(result).toContain('slide_2');
    expect(result).toContain('B');
    expect(result).not.toContain('slide_1');
    expect(result).not.toContain('A');
    expect(result).toContain('1 slide');
  });

  it('warns about (but does not error on) slideObjectIds that do not match', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        title: 'X',
        slides: [{ objectId: 'slide_1', pageElements: [] }],
      },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    const result = await execute(
      { presentationId: 'p1', format: 'json', slideObjectIds: ['slide_1', 'slide_missing'] },
      { log: mockLog }
    );
    const parsed = JSON.parse(result);

    expect(parsed.slides.map((s: any) => s.objectId)).toEqual(['slide_1']);
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('slide_missing'));
  });

  it('handles presentations with no slides', async () => {
    const get = vi.fn().mockResolvedValue({ data: { title: 'Empty', slides: [] } });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    const result = await execute({ presentationId: 'p1', format: 'text' }, { log: mockLog });

    expect(result).toContain('has no slides');
  });

  it('translates 404 to a clean error', async () => {
    const get = vi.fn().mockRejectedValue({ code: 404, message: 'not found' });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    await expect(
      execute({ presentationId: 'bogus', format: 'text' }, { log: mockLog })
    ).rejects.toThrow(/Presentation not found/);
  });

  it('translates 403 to permission-denied message', async () => {
    const get = vi.fn().mockRejectedValue({ code: 403, message: 'forbidden' });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerRead);
    await expect(
      execute({ presentationId: 'p1', format: 'text' }, { log: mockLog })
    ).rejects.toThrow(/Permission denied/);
  });
});

describe('listSlides', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns slide index, objectId, element count, and a text preview', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        title: 'Deck',
        slides: [
          {
            objectId: 'slide_a',
            pageElements: [
              {
                shape: {
                  text: { textElements: [{ textRun: { content: 'Title goes here\n' } }] },
                },
              },
              { shape: {} },
            ],
          },
        ],
      },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerList);
    const result = await execute({ presentationId: 'p1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.title).toBe('Deck');
    expect(parsed.slideCount).toBe(1);
    expect(parsed.slides[0]).toMatchObject({
      index: 1,
      objectId: 'slide_a',
      elementCount: 2,
      preview: 'Title goes here',
    });
  });

  it('preview is null when no text elements exist on the slide', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { slides: [{ objectId: 's1', pageElements: [{ image: {} }] }] },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerList);
    const result = await execute({ presentationId: 'p1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.slides[0].preview).toBeNull();
  });

  it('prefers a TITLE placeholder over earlier non-title text for preview', async () => {
    // Slide where the body text comes first in pageElements, then the title.
    // Without TITLE-priority routing, preview would be body text — wrong for
    // a deck navigation preview.
    const get = vi.fn().mockResolvedValue({
      data: {
        slides: [
          {
            objectId: 's1',
            pageElements: [
              {
                shape: { text: { textElements: [{ textRun: { content: 'Body bullet text' } }] } },
              },
              {
                shape: {
                  placeholder: { type: 'TITLE' },
                  text: { textElements: [{ textRun: { content: 'Real Slide Title' } }] },
                },
              },
            ],
          },
        ],
      },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerList);
    const result = await execute({ presentationId: 'p1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.slides[0].preview).toBe('Real Slide Title');
  });

  it('translates 403 to permission-denied message', async () => {
    const get = vi.fn().mockRejectedValue({ code: 403, message: 'forbidden' });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerList);
    await expect(execute({ presentationId: 'p1' }, { log: mockLog })).rejects.toThrow(
      /Permission denied/
    );
  });

  it('truncates long previews to 80 chars', async () => {
    const longText = 'A'.repeat(200);
    const get = vi.fn().mockResolvedValue({
      data: {
        slides: [
          {
            objectId: 's1',
            pageElements: [
              { shape: { text: { textElements: [{ textRun: { content: longText } }] } } },
            ],
          },
        ],
      },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { get } } as any);

    const execute = captureExecute(registerList);
    const result = await execute({ presentationId: 'p1' }, { log: mockLog });
    const parsed = JSON.parse(result);

    expect(parsed.slides[0].preview.length).toBeLessThanOrEqual(80);
    expect(parsed.slides[0].preview).toMatch(/\.\.\.$/);
  });
});
