import { describe, it, expect } from 'vitest';
import { hexToRgbColor, validateHexColor, TextStyleParameters } from './types.js';

describe('Color Validation and Conversion', () => {
  describe('validateHexColor', () => {
    it('should validate correct hex colors with hash', () => {
      expect(validateHexColor('#FF0000')).toBe(true);
      expect(validateHexColor('#F00')).toBe(true);
      expect(validateHexColor('#00FF00')).toBe(true);
      expect(validateHexColor('#0F0')).toBe(true);
    });

    it('should validate correct hex colors without hash', () => {
      expect(validateHexColor('FF0000')).toBe(true);
      expect(validateHexColor('F00')).toBe(true);
      expect(validateHexColor('00FF00')).toBe(true);
      expect(validateHexColor('0F0')).toBe(true);
    });

    it('should reject invalid hex colors', () => {
      expect(validateHexColor('')).toBe(false);
      expect(validateHexColor('#XYZ')).toBe(false);
      expect(validateHexColor('#12345')).toBe(false);
      expect(validateHexColor('#1234567')).toBe(false);
      expect(validateHexColor('invalid')).toBe(false);
      expect(validateHexColor('#12')).toBe(false);
    });
  });

  describe('hexToRgbColor', () => {
    it('should convert 6-digit hex colors with hash correctly', () => {
      expect(hexToRgbColor('#FF0000')).toEqual({ red: 1, green: 0, blue: 0 });
      expect(hexToRgbColor('#00FF00')).toEqual({ red: 0, green: 1, blue: 0 });
      expect(hexToRgbColor('#0000FF')).toEqual({ red: 0, green: 0, blue: 1 });
      expect(hexToRgbColor('#800080')).toEqual({
        red: 0.5019607843137255,
        green: 0,
        blue: 0.5019607843137255,
      });
    });

    it('should convert 3-digit hex colors correctly', () => {
      expect(hexToRgbColor('#F00')).toEqual({ red: 1, green: 0, blue: 0 });
      expect(hexToRgbColor('#FFF')).toEqual({ red: 1, green: 1, blue: 1 });
    });

    it('should convert hex colors without hash correctly', () => {
      expect(hexToRgbColor('FF0000')).toEqual({ red: 1, green: 0, blue: 0 });
    });

    it('should return null for invalid hex colors', () => {
      expect(hexToRgbColor('')).toBeNull();
      expect(hexToRgbColor('#XYZ')).toBeNull();
      expect(hexToRgbColor('#12345')).toBeNull();
      expect(hexToRgbColor('invalid')).toBeNull();
    });
  });
});

describe('TextStyleParameters', () => {
  it('accepts linkHeading with just a headingId', () => {
    const result = TextStyleParameters.safeParse({
      linkHeading: { headingId: 'h.abc123' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts linkHeading with a cross-tab tabId', () => {
    const result = TextStyleParameters.safeParse({
      linkHeading: { headingId: 'h.abc123', tabId: 't.target' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects linkHeading and linkUrl together', () => {
    const result = TextStyleParameters.safeParse({
      linkUrl: 'https://example.com',
      linkHeading: { headingId: 'h.abc123' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty headingId', () => {
    const result = TextStyleParameters.safeParse({
      linkHeading: { headingId: '' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts linkUrl: null (clear) together with linkHeading (clear-and-relink in one call)', () => {
    // null means "clear the existing hyperlink," not "set a URL link," so it
    // doesn't conflict with linkHeading the way a truthy linkUrl would.
    const result = TextStyleParameters.safeParse({
      linkUrl: null,
      linkHeading: { headingId: 'h.abc123' },
    });
    expect(result.success).toBe(true);
  });
});
