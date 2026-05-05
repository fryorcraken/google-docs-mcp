import { describe, it, expect } from 'vitest';
import { buildModifyTextRequests } from './modifyText.js';

describe('buildModifyTextRequests', () => {
  describe('insert mode', () => {
    it('should produce a single insertText request with no delete', () => {
      const requests = buildModifyTextRequests({ startIndex: 5, text: 'hello' });

      expect(requests).toHaveLength(1);
      expect(requests[0]).toHaveProperty('insertText');
      expect(requests[0]).not.toHaveProperty('deleteContentRange');
      expect(requests[0].insertText!.location!.index).toBe(5);
      expect(requests[0].insertText!.text).toBe('hello');
    });
  });

  describe('replace mode', () => {
    it('should produce deleteContentRange then insertText in that order', () => {
      const requests = buildModifyTextRequests({ startIndex: 5, endIndex: 10, text: 'hi' });

      expect(requests).toHaveLength(2);

      // First request must be delete (not insert — wrong order causes index shift)
      expect(requests[0]).toHaveProperty('deleteContentRange');
      expect(requests[0].deleteContentRange!.range!.startIndex).toBe(5);
      expect(requests[0].deleteContentRange!.range!.endIndex).toBe(10);

      // Second request is insert at the same startIndex
      expect(requests[1]).toHaveProperty('insertText');
      expect(requests[1].insertText!.location!.index).toBe(5);
      expect(requests[1].insertText!.text).toBe('hi');
    });
  });

  describe('format-only mode', () => {
    it('should produce a single updateTextStyle using the original range', () => {
      const requests = buildModifyTextRequests({
        startIndex: 5,
        endIndex: 10,
        style: { bold: true },
      });

      expect(requests).toHaveLength(1);
      expect(requests[0]).not.toHaveProperty('deleteContentRange');
      expect(requests[0]).not.toHaveProperty('insertText');
      expect(requests[0]).toHaveProperty('updateTextStyle');
      expect(requests[0].updateTextStyle!.range!.startIndex).toBe(5);
      expect(requests[0].updateTextStyle!.range!.endIndex).toBe(10);
      expect(requests[0].updateTextStyle!.textStyle!.bold).toBe(true);
      expect(requests[0].updateTextStyle!.fields).toBe('bold');
    });
  });

  describe('replace + format mode', () => {
    it('should adjust the format range to match the newly inserted text length', () => {
      const requests = buildModifyTextRequests({
        startIndex: 5,
        endIndex: 10,
        text: 'hi',
        style: { bold: true },
      });

      expect(requests).toHaveLength(3);

      // Delete original range
      expect(requests[0]).toHaveProperty('deleteContentRange');
      expect(requests[0].deleteContentRange!.range!.startIndex).toBe(5);
      expect(requests[0].deleteContentRange!.range!.endIndex).toBe(10);

      // Insert replacement text
      expect(requests[1]).toHaveProperty('insertText');
      expect(requests[1].insertText!.location!.index).toBe(5);
      expect(requests[1].insertText!.text).toBe('hi');

      // Format the NEW range [5, 7), NOT the original [5, 10)
      expect(requests[2]).toHaveProperty('updateTextStyle');
      expect(requests[2].updateTextStyle!.range!.startIndex).toBe(5);
      expect(requests[2].updateTextStyle!.range!.endIndex).toBe(7); // 5 + "hi".length
      expect(requests[2].updateTextStyle!.textStyle!.bold).toBe(true);
    });
  });

  describe('insert + format mode', () => {
    it('should insert text and format the inserted range', () => {
      const requests = buildModifyTextRequests({
        startIndex: 5,
        text: 'hi',
        style: { italic: true },
      });

      expect(requests).toHaveLength(2);

      // No delete — this is insert-only
      expect(requests[0]).toHaveProperty('insertText');
      expect(requests[0]).not.toHaveProperty('deleteContentRange');
      expect(requests[0].insertText!.location!.index).toBe(5);
      expect(requests[0].insertText!.text).toBe('hi');

      // Format the inserted range [5, 7)
      expect(requests[1]).toHaveProperty('updateTextStyle');
      expect(requests[1].updateTextStyle!.range!.startIndex).toBe(5);
      expect(requests[1].updateTextStyle!.range!.endIndex).toBe(7); // 5 + "hi".length
      expect(requests[1].updateTextStyle!.textStyle!.italic).toBe(true);
      expect(requests[1].updateTextStyle!.fields).toBe('italic');
    });
  });

  describe('tabId propagation', () => {
    it('should include tabId on all request locations/ranges when provided', () => {
      const requests = buildModifyTextRequests({
        startIndex: 5,
        endIndex: 10,
        text: 'hi',
        style: { bold: true },
        tabId: 't1',
      });

      expect(requests).toHaveLength(3);
      expect((requests[0].deleteContentRange!.range as any).tabId).toBe('t1');
      expect((requests[1].insertText!.location as any).tabId).toBe('t1');
      expect(requests[2].updateTextStyle!.range!.tabId).toBe('t1');
    });

    it('should not include tabId when not provided', () => {
      const requests = buildModifyTextRequests({
        startIndex: 5,
        endIndex: 10,
        text: 'hi',
        style: { bold: true },
      });

      expect(requests).toHaveLength(3);
      expect((requests[0].deleteContentRange!.range as any).tabId).toBeUndefined();
      expect((requests[1].insertText!.location as any).tabId).toBeUndefined();
      expect(requests[2].updateTextStyle!.range!.tabId).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should return empty array when neither text nor style is provided', () => {
      const requests = buildModifyTextRequests({ startIndex: 5, endIndex: 10 });
      expect(requests).toHaveLength(0);
    });

    it('should not generate delete when endIndex is provided but text is not', () => {
      const requests = buildModifyTextRequests({
        startIndex: 5,
        endIndex: 10,
        style: { underline: true },
      });

      expect(requests).toHaveLength(1);
      expect(requests[0]).toHaveProperty('updateTextStyle');
      expect(requests[0]).not.toHaveProperty('deleteContentRange');
    });

    it('should handle multiple style fields correctly', () => {
      const requests = buildModifyTextRequests({
        startIndex: 1,
        endIndex: 5,
        style: { bold: true, italic: true, fontSize: 14 },
      });

      expect(requests).toHaveLength(1);
      const style = requests[0].updateTextStyle!;
      expect(style.textStyle!.bold).toBe(true);
      expect(style.textStyle!.italic).toBe(true);
      expect(style.textStyle!.fontSize).toEqual({ magnitude: 14, unit: 'PT' });
      expect(style.fields).toBe('bold,italic,fontSize');
    });
  });
});
