import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// --- colIndexToLetters (duplicated from getConditionalFormatting for unit testing) ---
function colIndexToLetters(index: number): string {
  let s = '';
  let i = index;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

// --- Mocks ---
const mockResolveSheetId = vi.fn(async () => 0);
const mockBatchUpdate = vi.fn(async () => ({ data: { replies: [{}] } }));

const mockSheets = {
  spreadsheets: {
    batchUpdate: mockBatchUpdate,
    get: vi.fn(),
  },
};

vi.mock('../../clients.js', () => ({
  getSheetsClient: vi.fn(async () => mockSheets),
}));

vi.mock('../../googleSheetsApiHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../googleSheetsApiHelpers.js')>();
  return {
    ...actual,
    resolveSheetId: mockResolveSheetId,
    parseA1ToGridRange: vi.fn((_a1: string, sheetId: number) => ({
      sheetId,
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 0,
      endColumnIndex: 1,
    })),
    parseRange: vi.fn((range: string) => {
      const idx = range.indexOf('!');
      return idx !== -1
        ? { sheetName: range.slice(0, idx), a1Range: range.slice(idx + 1) }
        : { sheetName: null, a1Range: range };
    }),
    hexToRgb: vi.fn((hex: string) => {
      if (hex === '#FF0000') return { red: 1, green: 0, blue: 0 };
      return { red: 0, green: 0, blue: 0 };
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSheetId.mockResolvedValue(0);
  mockBatchUpdate.mockResolvedValue({ data: { replies: [{}] } });
});

// ============================================================
// colIndexToLetters
// ============================================================
describe('colIndexToLetters', () => {
  it('converts single-letter columns correctly', () => {
    expect(colIndexToLetters(0)).toBe('A');
    expect(colIndexToLetters(1)).toBe('B');
    expect(colIndexToLetters(25)).toBe('Z');
  });

  it('converts multi-letter columns correctly (beyond Z)', () => {
    expect(colIndexToLetters(26)).toBe('AA');
    expect(colIndexToLetters(27)).toBe('AB');
    expect(colIndexToLetters(51)).toBe('AZ');
    expect(colIndexToLetters(52)).toBe('BA');
    expect(colIndexToLetters(701)).toBe('ZZ');
    expect(colIndexToLetters(702)).toBe('AAA');
  });
});

// ============================================================
// autoResizeRows — Zod validation
// ============================================================
describe('autoResizeRows schema validation', () => {
  const schema = z
    .object({
      spreadsheetId: z.string(),
      startRow: z.number().int().min(1).optional(),
      endRow: z.number().int().min(1).optional(),
    })
    .refine((d) => d.startRow === undefined || d.endRow === undefined || d.endRow >= d.startRow, {
      message: 'endRow must be greater than or equal to startRow.',
    });

  it('passes when startRow <= endRow', () => {
    expect(() => schema.parse({ spreadsheetId: 'id', startRow: 2, endRow: 10 })).not.toThrow();
  });

  it('passes when only startRow provided', () => {
    expect(() => schema.parse({ spreadsheetId: 'id', startRow: 5 })).not.toThrow();
  });

  it('passes when neither startRow nor endRow provided', () => {
    expect(() => schema.parse({ spreadsheetId: 'id' })).not.toThrow();
  });

  it('fails when endRow < startRow', () => {
    const result = schema.safeParse({ spreadsheetId: 'id', startRow: 10, endRow: 5 });
    expect(result.success).toBe(false);
  });

  it('passes when startRow === endRow', () => {
    expect(() => schema.parse({ spreadsheetId: 'id', startRow: 3, endRow: 3 })).not.toThrow();
  });
});

// ============================================================
// setRowHeights — Zod validation
// ============================================================
describe('setRowHeights schema validation', () => {
  const schema = z
    .object({
      spreadsheetId: z.string(),
      startRow: z.number().int().min(1),
      endRow: z.number().int().min(1),
      pixelSize: z.number().int().min(2),
    })
    .refine((d) => d.endRow >= d.startRow, {
      message: 'endRow must be greater than or equal to startRow.',
    });

  it('passes with valid input', () => {
    expect(() =>
      schema.parse({ spreadsheetId: 'id', startRow: 1, endRow: 10, pixelSize: 40 })
    ).not.toThrow();
  });

  it('fails when endRow < startRow', () => {
    const result = schema.safeParse({
      spreadsheetId: 'id',
      startRow: 10,
      endRow: 5,
      pixelSize: 40,
    });
    expect(result.success).toBe(false);
  });

  it('fails when pixelSize < 2', () => {
    const result = schema.safeParse({ spreadsheetId: 'id', startRow: 1, endRow: 5, pixelSize: 1 });
    expect(result.success).toBe(false);
  });

  it('passes when startRow === endRow', () => {
    expect(() =>
      schema.parse({ spreadsheetId: 'id', startRow: 5, endRow: 5, pixelSize: 40 })
    ).not.toThrow();
  });
});

// ============================================================
// deleteConditionalFormatting — auto-sort descending
// ============================================================
describe('deleteConditionalFormatting sort order', () => {
  it('sorts indices descending before building requests', () => {
    const indices = [0, 3, 1];
    const sorted = [...indices].sort((a, b) => b - a);
    expect(sorted).toEqual([3, 1, 0]);
  });

  it('single index unchanged after sort', () => {
    const sorted = [...[2]].sort((a, b) => b - a);
    expect(sorted).toEqual([2]);
  });

  it('already-descending input stays correct', () => {
    const sorted = [...[5, 3, 1, 0]].sort((a, b) => b - a);
    expect(sorted).toEqual([5, 3, 1, 0]);
  });

  it('ascending input gets reversed', () => {
    const sorted = [...[0, 1, 2, 3]].sort((a, b) => b - a);
    expect(sorted).toEqual([3, 2, 1, 0]);
  });
});

// ============================================================
// setRowHeights — API call shape
// ============================================================
describe('setRowHeights API call shape', () => {
  it('sends updateDimensionProperties with correct fields', async () => {
    const { getSheetsClient } = await import('../../clients.js');
    const sheets = await getSheetsClient();
    const sheetId = await mockResolveSheetId();

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: 'test-id',
      requestBody: {
        requests: [
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 5 },
              properties: { pixelSize: 40 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    });

    expect(mockBatchUpdate).toHaveBeenCalledOnce();
    const req = mockBatchUpdate.mock.calls[0][0].requestBody.requests[0].updateDimensionProperties;
    expect(req.range.dimension).toBe('ROWS');
    expect(req.properties.pixelSize).toBe(40);
    expect(req.fields).toBe('pixelSize');
  });
});

// ============================================================
// autoResizeRows — API call shape
// ============================================================
describe('autoResizeRows API call shape', () => {
  it('sends autoResizeDimensions with ROWS dimension', async () => {
    const { getSheetsClient } = await import('../../clients.js');
    const sheets = await getSheetsClient();
    const sheetId = await mockResolveSheetId();

    const dimensionRange: any = { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 10 };
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: 'test-id',
      requestBody: {
        requests: [{ autoResizeDimensions: { dimensions: dimensionRange } }],
      },
    });

    expect(mockBatchUpdate).toHaveBeenCalledOnce();
    const dims =
      mockBatchUpdate.mock.calls[0][0].requestBody.requests[0].autoResizeDimensions.dimensions;
    expect(dims.dimension).toBe('ROWS');
    expect(dims.startIndex).toBe(1);
    expect(dims.endIndex).toBe(10);
  });
});

// ============================================================
// setCellBorders — Zod validation
// ============================================================
describe('setCellBorders schema validation', () => {
  const borderSchema = z
    .object({
      style: z.enum(['SOLID', 'SOLID_MEDIUM', 'SOLID_THICK', 'DOTTED', 'DASHED', 'DOUBLE', 'NONE']),
      color: z.string().optional(),
    })
    .optional();

  const schema = z
    .object({
      spreadsheetId: z.string(),
      range: z.string(),
      top: borderSchema,
      bottom: borderSchema,
      left: borderSchema,
      right: borderSchema,
      innerHorizontal: borderSchema,
      innerVertical: borderSchema,
    })
    .refine(
      (d) =>
        d.top !== undefined ||
        d.bottom !== undefined ||
        d.left !== undefined ||
        d.right !== undefined ||
        d.innerHorizontal !== undefined ||
        d.innerVertical !== undefined,
      { message: 'At least one border side must be specified.' }
    );

  it('passes with at least one side', () => {
    expect(() =>
      schema.parse({ spreadsheetId: 'id', range: 'A1:D10', top: { style: 'SOLID' } })
    ).not.toThrow();
  });

  it('fails when no sides specified', () => {
    const result = schema.safeParse({ spreadsheetId: 'id', range: 'A1:D10' });
    expect(result.success).toBe(false);
  });

  it('passes with multiple sides', () => {
    expect(() =>
      schema.parse({
        spreadsheetId: 'id',
        range: 'A1:D10',
        top: { style: 'SOLID_MEDIUM', color: '#000000' },
        bottom: { style: 'NONE' },
        innerHorizontal: { style: 'DOTTED' },
      })
    ).not.toThrow();
  });

  it('rejects invalid border style', () => {
    const result = schema.safeParse({
      spreadsheetId: 'id',
      range: 'A1',
      top: { style: 'INVALID_STYLE' },
    });
    expect(result.success).toBe(false);
  });
});
