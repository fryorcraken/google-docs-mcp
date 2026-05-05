import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'autoResizeRows',
    description:
      'Auto-resizes rows in a spreadsheet to fit their content. Optionally restrict to a row range (e.g., startRow=2, endRow=50); defaults to all rows.',
    parameters: z
      .object({
        spreadsheetId: z
          .string()
          .describe(
            'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
          ),
        sheetName: z
          .string()
          .optional()
          .describe('Name of the sheet/tab. Defaults to the first sheet if not provided.'),
        startRow: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('1-based start row index (inclusive). Omit to start from row 1.'),
        endRow: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('1-based end row index (inclusive). Omit to resize to the last row.'),
      })
      .refine((d) => d.startRow === undefined || d.endRow === undefined || d.endRow >= d.startRow, {
        message: 'endRow must be greater than or equal to startRow.',
      }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Auto-resizing rows in spreadsheet ${args.spreadsheetId}`);

      try {
        const sheetId = await SheetsHelpers.resolveSheetId(
          sheets,
          args.spreadsheetId,
          args.sheetName
        );

        const dimensionRange: any = { sheetId, dimension: 'ROWS' };
        if (args.startRow !== undefined) dimensionRange.startIndex = args.startRow - 1;
        if (args.endRow !== undefined) dimensionRange.endIndex = args.endRow;

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: args.spreadsheetId,
          requestBody: {
            requests: [{ autoResizeDimensions: { dimensions: dimensionRange } }],
          },
        });

        const rangeDesc =
          args.startRow !== undefined
            ? `rows ${args.startRow}–${args.endRow ?? 'end'}`
            : 'all rows';
        return `Successfully auto-resized ${rangeDesc} to fit content.`;
      } catch (error: any) {
        log.error(`Error auto-resizing rows: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to auto-resize rows: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
