import { describe, it, expect } from 'vitest';
import { buildUpdateSectionStyleRequest } from './updateSectionStyle.js';

describe('buildUpdateSectionStyleRequest', () => {
  it('returns null when no style options are provided', () => {
    const result = buildUpdateSectionStyleRequest({ startIndex: 1, endIndex: 10 });
    expect(result).toBeNull();
  });

  it('builds a flipPageOrientation request with a matching fields mask', () => {
    const result = buildUpdateSectionStyleRequest({
      startIndex: 10,
      endIndex: 42,
      flipPageOrientation: true,
    });

    expect(result).not.toBeNull();
    expect(result!.fields).toEqual(['flipPageOrientation']);

    const req = result!.request.updateSectionStyle!;
    expect(req.range!.startIndex).toBe(10);
    expect(req.range!.endIndex).toBe(42);
    expect(req.sectionStyle!.flipPageOrientation).toBe(true);
    expect(req.fields).toBe('flipPageOrientation');
  });

  it('converts margin numbers to PT dimensions', () => {
    const result = buildUpdateSectionStyleRequest({
      startIndex: 1,
      endIndex: 5,
      marginTop: 36,
      marginLeft: 72,
    });

    expect(result).not.toBeNull();
    const style = result!.request.updateSectionStyle!.sectionStyle!;
    expect(style.marginTop).toEqual({ magnitude: 36, unit: 'PT' });
    expect(style.marginLeft).toEqual({ magnitude: 72, unit: 'PT' });
    expect(result!.fields).toContain('marginTop');
    expect(result!.fields).toContain('marginLeft');
    expect(result!.request.updateSectionStyle!.fields).toBe('marginTop,marginLeft');
  });

  it('combines multiple updates into a single fields mask', () => {
    const result = buildUpdateSectionStyleRequest({
      startIndex: 1,
      endIndex: 5,
      flipPageOrientation: false,
      sectionType: 'CONTINUOUS',
      pageNumberStart: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.fields).toEqual(['flipPageOrientation', 'sectionType', 'pageNumberStart']);
    expect(result!.request.updateSectionStyle!.fields).toBe(
      'flipPageOrientation,sectionType,pageNumberStart'
    );
  });

  it('attaches tabId to the range when provided', () => {
    const result = buildUpdateSectionStyleRequest({
      startIndex: 1,
      endIndex: 5,
      flipPageOrientation: true,
      tabId: 'tab-abc',
    });

    expect((result!.request.updateSectionStyle!.range as any).tabId).toBe('tab-abc');
  });
});
