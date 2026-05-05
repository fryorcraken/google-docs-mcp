import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

const borderStyleEnum = z.enum([
  'SOLID',
  'SOLID_MEDIUM',
  'SOLID_THICK',
  'DOTTED',
  'DASHED',
  'DOUBLE',
  'NONE',
]);

const borderSchema = z
  .object({
    style: borderStyleEnum.describe('Border line style.'),
    color: z
      .string()
      .optional()
      .describe('Border color as hex (e.g., "#000000"). Defaults to black.'),
  })
  .optional();

export function register(server: FastMCP) {
  server.addTool({
    name: 'setCellBorders',
    description:
      'Sets borders on a range of cells. Each side (top, bottom, left, right, innerHorizontal, innerVertical) can be configured independently with a style and color. Use style "NONE" to remove a border.',
    parameters: z
      .object({
        spreadsheetId: z
          .string()
          .describe(
            'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
          ),
        range: z.string().describe('A1 notation range (e.g., "Sheet1!A1:D10", "1:1", "A:A").'),
        top: borderSchema.describe('Top border of the range.'),
        bottom: borderSchema.describe('Bottom border of the range.'),
        left: borderSchema.describe('Left border of the range.'),
        right: borderSchema.describe('Right border of the range.'),
        innerHorizontal: borderSchema.describe('Horizontal borders between rows inside the range.'),
        innerVertical: borderSchema.describe('Vertical borders between columns inside the range.'),
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
      ),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Setting borders on range "${args.range}" in spreadsheet ${args.spreadsheetId}`);

      try {
        const { sheetName, a1Range } = SheetsHelpers.parseRange(args.range);
        const sheetId = await SheetsHelpers.resolveSheetId(sheets, args.spreadsheetId, sheetName);
        const gridRange = SheetsHelpers.parseA1ToGridRange(a1Range, sheetId);

        const buildBorder = (b: { style: string; color?: string } | undefined) => {
          if (!b) return undefined;
          const border: any = { style: b.style };
          if (b.color) {
            const rgb = SheetsHelpers.hexToRgb(b.color);
            if (!rgb) throw new UserError(`Invalid border color: "${b.color}".`);
            border.colorStyle = { rgbColor: rgb };
          }
          return border;
        };

        const borders: any = {};
        if (args.top !== undefined) borders.top = buildBorder(args.top);
        if (args.bottom !== undefined) borders.bottom = buildBorder(args.bottom);
        if (args.left !== undefined) borders.left = buildBorder(args.left);
        if (args.right !== undefined) borders.right = buildBorder(args.right);
        if (args.innerHorizontal !== undefined)
          borders.innerHorizontal = buildBorder(args.innerHorizontal);
        if (args.innerVertical !== undefined)
          borders.innerVertical = buildBorder(args.innerVertical);

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: args.spreadsheetId,
          requestBody: {
            requests: [{ updateBorders: { range: gridRange, ...borders } }],
          },
        });

        return `Successfully set borders on range "${args.range}".`;
      } catch (error: any) {
        log.error(`Error setting borders: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to set borders: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
