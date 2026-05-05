import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../clients.js', () => ({
  getSlidesClient: vi.fn(),
}));

import { getSlidesClient } from '../../clients.js';
import { register as registerAddSlide } from './addSlide.js';
import { register as registerDeleteSlide } from './deleteSlide.js';
import { register as registerDuplicateSlide } from './duplicateSlide.js';
import { register as registerMoveSlide } from './moveSlide.js';
import { register as registerReplaceAllText } from './replaceAllText.js';
import { register as registerInsertSlideText } from './insertSlideText.js';
import { register as registerApplySlideTextStyle } from './applySlideTextStyle.js';
import { register as registerInsertSlideImage } from './insertSlideImage.js';

const mockGetSlidesClient = vi.mocked(getSlidesClient);
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

// NOTE: tests bypass FastMCP's schema validation (we capture `execute`
// directly), so Zod `.default()` and `.refine()` do NOT apply. Pass
// explicit values for any defaulted fields and assert on runtime guards
// rather than schema-only behavior.
function captureExecute(register: (server: any) => void) {
  let execute: (args: any, ctx: any) => Promise<string> = async () => '';
  register({ addTool: (config: any) => (execute = config.execute) });
  return execute;
}

function makeMockSlides(batchUpdateResponse: any) {
  const batchUpdate = vi.fn().mockResolvedValue({ data: batchUpdateResponse });
  return { client: { presentations: { batchUpdate } }, batchUpdate };
}

describe('addSlide', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a createSlide request and returns the new slide objectId', async () => {
    const { client, batchUpdate } = makeMockSlides({
      replies: [{ createSlide: { objectId: 'slide_xyz' } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerAddSlide);
    const result = await execute(
      { presentationId: 'p1', insertionIndex: 2, predefinedLayout: 'TITLE' },
      { log: mockLog }
    );
    const parsed = JSON.parse(result);

    expect(parsed.slideObjectId).toBe('slide_xyz');
    expect(parsed.layout).toBe('TITLE');

    const call = batchUpdate.mock.calls[0][0];
    expect(call.presentationId).toBe('p1');
    expect(call.requestBody.requests[0].createSlide).toMatchObject({
      insertionIndex: 2,
      slideLayoutReference: { predefinedLayout: 'TITLE' },
    });
  });

  it('passes the supplied layout into createSlide', async () => {
    const { client, batchUpdate } = makeMockSlides({
      replies: [{ createSlide: { objectId: 'slide_a' } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerAddSlide);
    await execute({ presentationId: 'p1', predefinedLayout: 'TITLE_AND_BODY' }, { log: mockLog });

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.createSlide.slideLayoutReference.predefinedLayout).toBe('TITLE_AND_BODY');
    expect(req.createSlide.insertionIndex).toBeUndefined();
  });

  it('forwards a caller-supplied slideObjectId to createSlide', async () => {
    const { client, batchUpdate } = makeMockSlides({
      replies: [{ createSlide: { objectId: 'my_custom_id' } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerAddSlide);
    const result = await execute(
      {
        presentationId: 'p1',
        predefinedLayout: 'BLANK',
        slideObjectId: 'my_custom_id',
      },
      { log: mockLog }
    );

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.createSlide.objectId).toBe('my_custom_id');
    expect(JSON.parse(result).slideObjectId).toBe('my_custom_id');
  });
});

describe('deleteSlide', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues a deleteObject request', async () => {
    const { client, batchUpdate } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerDeleteSlide);
    const result = await execute(
      { presentationId: 'p1', slideObjectId: 'slide_a' },
      { log: mockLog }
    );

    expect(result).toContain('slide_a');
    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.deleteObject.objectId).toBe('slide_a');
  });
});

describe('duplicateSlide', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the new objectId from the API reply', async () => {
    const { client } = makeMockSlides({
      replies: [{ duplicateObject: { objectId: 'slide_clone' } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerDuplicateSlide);
    const result = await execute(
      { presentationId: 'p1', slideObjectId: 'slide_orig' },
      { log: mockLog }
    );
    const parsed = JSON.parse(result);

    expect(parsed.duplicatedFrom).toBe('slide_orig');
    expect(parsed.newSlideObjectId).toBe('slide_clone');
  });
});

describe('moveSlide', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds an updateSlidesPosition request', async () => {
    const { client, batchUpdate } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerMoveSlide);
    await execute(
      { presentationId: 'p1', slideObjectId: 'slide_a', newIndex: 3 },
      { log: mockLog }
    );

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.updateSlidesPosition).toEqual({
      slideObjectIds: ['slide_a'],
      insertionIndex: 3,
    });
  });
});

describe('replaceAllText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns occurrencesChanged from the API reply', async () => {
    const { client } = makeMockSlides({
      replies: [{ replaceAllText: { occurrencesChanged: 5 } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerReplaceAllText);
    const result = await execute(
      { presentationId: 'p1', findText: '{{NAME}}', replaceText: 'Alice' },
      { log: mockLog }
    );

    expect(JSON.parse(result).occurrencesChanged).toBe(5);
  });

  it('passes matchCase through to the API', async () => {
    const { client, batchUpdate } = makeMockSlides({
      replies: [{ replaceAllText: { occurrencesChanged: 0 } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerReplaceAllText);
    await execute(
      { presentationId: 'p1', findText: 'x', replaceText: 'y', matchCase: true },
      { log: mockLog }
    );

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.replaceAllText.containsText.matchCase).toBe(true);
  });
});

describe('insertSlideText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes shape objectId, text, and optional insertionIndex', async () => {
    const { client, batchUpdate } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerInsertSlideText);
    await execute(
      { presentationId: 'p1', shapeObjectId: 'shape_1', text: 'Hello', insertionIndex: 0 },
      { log: mockLog }
    );

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.insertText).toEqual({
      objectId: 'shape_1',
      text: 'Hello',
      insertionIndex: 0,
    });
  });
});

describe('applySlideTextStyle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds an updateTextStyle request with FIXED_RANGE and only requested fields', async () => {
    const { client, batchUpdate } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerApplySlideTextStyle);
    await execute(
      {
        presentationId: 'p1',
        shapeObjectId: 'shape_1',
        textRange: { startIndex: 0, endIndex: 5 },
        style: { bold: true, foregroundColor: '#FF0000' },
      },
      { log: mockLog }
    );

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0].updateTextStyle;
    expect(req.objectId).toBe('shape_1');
    expect(req.textRange).toEqual({ type: 'FIXED_RANGE', startIndex: 0, endIndex: 5 });
    expect(req.style.bold).toBe(true);
    expect(req.style.foregroundColor.opaqueColor.rgbColor.red).toBe(1);
    // fields mask must include exactly what was set, nothing else
    expect(req.fields.split(',').sort()).toEqual(['bold', 'foregroundColor']);
  });

  it('uses range type ALL when textRange is omitted', async () => {
    const { client, batchUpdate } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerApplySlideTextStyle);
    await execute(
      { presentationId: 'p1', shapeObjectId: 'shape_1', style: { italic: true } },
      { log: mockLog }
    );

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0].updateTextStyle;
    expect(req.textRange).toEqual({ type: 'ALL' });
    expect(req.fields).toBe('italic');
  });

  it('runtime-guards against an all-undefined style (schema-bypass safety)', async () => {
    const { client } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    // Schema-level .refine() runs only via FastMCP. Direct callers can
    // bypass it; the runtime guard inside execute() must catch this.
    const execute = captureExecute(registerApplySlideTextStyle);
    await expect(
      execute(
        {
          presentationId: 'p1',
          shapeObjectId: 'shape_1',
          style: {},
        },
        { log: mockLog }
      )
    ).rejects.toThrow(/At least one style option/);
  });

  it('rejects textRange where endIndex <= startIndex', async () => {
    const { client } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerApplySlideTextStyle);
    await expect(
      execute(
        {
          presentationId: 'p1',
          shapeObjectId: 'shape_1',
          textRange: { startIndex: 5, endIndex: 5 },
          style: { bold: true },
        },
        { log: mockLog }
      )
    ).rejects.toThrow(/endIndex must be greater/);
  });
});

describe('insertSlideImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the new image objectId and routes to the right slide', async () => {
    const { client, batchUpdate } = makeMockSlides({
      replies: [{ createImage: { objectId: 'image_1' } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerInsertSlideImage);
    const result = await execute(
      {
        presentationId: 'p1',
        slideObjectId: 'slide_a',
        imageUrl: 'https://example.com/x.png',
        size: { widthPt: 100, heightPt: 80 },
      },
      { log: mockLog }
    );
    const parsed = JSON.parse(result);

    expect(parsed.imageObjectId).toBe('image_1');
    expect(parsed.slideObjectId).toBe('slide_a');

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0].createImage;
    expect(req.url).toBe('https://example.com/x.png');
    expect(req.elementProperties.pageObjectId).toBe('slide_a');
    expect(req.elementProperties.size).toEqual({
      width: { magnitude: 100, unit: 'PT' },
      height: { magnitude: 80, unit: 'PT' },
    });
  });

  it.each([
    'http://169.254.169.254/computeMetadata/v1/',
    'http://localhost:8080/admin',
    'http://10.0.0.5/secret',
    'http://172.16.0.1/internal',
    'http://192.168.1.1/router',
    'http://127.0.0.1:5432/db',
    'http://metadata.google.internal/',
  ])('rejects fetch of private/loopback/link-local URL: %s', async (badUrl) => {
    const { client, batchUpdate } = makeMockSlides({});
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerInsertSlideImage);
    await expect(
      execute(
        { presentationId: 'p1', slideObjectId: 'slide_a', imageUrl: badUrl },
        { log: mockLog }
      )
    ).rejects.toThrow(/Refusing to fetch image URL/);
    // No batchUpdate should be issued for blocked URLs.
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it('omits size and transform when not specified', async () => {
    const { client, batchUpdate } = makeMockSlides({
      replies: [{ createImage: { objectId: 'image_2' } }],
    });
    mockGetSlidesClient.mockResolvedValue(client as any);

    const execute = captureExecute(registerInsertSlideImage);
    await execute(
      {
        presentationId: 'p1',
        slideObjectId: 'slide_a',
        imageUrl: 'https://example.com/y.png',
      },
      { log: mockLog }
    );

    const req = batchUpdate.mock.calls[0][0].requestBody.requests[0].createImage;
    expect(req.elementProperties.size).toBeUndefined();
    expect(req.elementProperties.transform).toBeUndefined();
  });
});

describe('shared executeBatchUpdate error translation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces accessNotConfigured 403 with an enable-API message on write tools', async () => {
    const batchUpdate = vi.fn().mockRejectedValue({
      code: 403,
      errors: [{ reason: 'accessNotConfigured' }],
      message: 'Slides API has not been used',
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { batchUpdate } } as any);

    const execute = captureExecute(registerAddSlide);
    await expect(execute({ presentationId: 'p1' }, { log: mockLog })).rejects.toThrow(
      /Slides API is not enabled/
    );
  });

  it('surfaces a 400 invalid-request error with the API detail message', async () => {
    const batchUpdate = vi.fn().mockRejectedValue({
      code: 400,
      response: { data: { error: { message: 'invalid object id format' } } },
    });
    mockGetSlidesClient.mockResolvedValue({ presentations: { batchUpdate } } as any);

    const execute = captureExecute(registerDeleteSlide);
    await expect(
      execute({ presentationId: 'p1', slideObjectId: 'bad!!' }, { log: mockLog })
    ).rejects.toThrow(/invalid object id format/);
  });
});
