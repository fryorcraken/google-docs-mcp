import { describe, it, expect } from 'vitest';
import { buildInsertSectionBreakRequest } from './insertSectionBreak.js';

describe('buildInsertSectionBreakRequest', () => {
  it('builds a NEXT_PAGE section break at the given index', () => {
    const request = buildInsertSectionBreakRequest({ index: 42, sectionType: 'NEXT_PAGE' });

    expect(request).toHaveProperty('insertSectionBreak');
    expect(request.insertSectionBreak!.location!.index).toBe(42);
    expect(request.insertSectionBreak!.sectionType).toBe('NEXT_PAGE');
    expect(request.insertSectionBreak!.location!.tabId).toBeUndefined();
  });

  it('builds a CONTINUOUS section break', () => {
    const request = buildInsertSectionBreakRequest({ index: 10, sectionType: 'CONTINUOUS' });

    expect(request.insertSectionBreak!.sectionType).toBe('CONTINUOUS');
  });

  it('includes tabId on the location when provided', () => {
    const request = buildInsertSectionBreakRequest({
      index: 5,
      sectionType: 'NEXT_PAGE',
      tabId: 'tab-1',
    });

    expect(request.insertSectionBreak!.location!.tabId).toBe('tab-1');
    expect(request.insertSectionBreak!.location!.index).toBe(5);
  });
});
