import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'setRowHeights',
    description:
      'Sets a fixed pixel height for a range of rows in a spreadsheet. Useful for ensuring rows are tall enough to display wrapped text.',
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
        startRow: z.number().int().min(1).describe('1-based start row index (inclusive).'),
        endRow: z.number().int().min(1).describe('1-based end row index (inclusive).'),
        pixelSize: z
          .number()
          .int()
          .min(2)
          .describe(
            'Height in pixels (e.g., 40 for comfortable single-line, 80 for two-line wrapped text).'
          ),
      })
      .refine((d) => d.endRow >= d.startRow, {
        message: 'endRow must be greater than or equal to startRow.',
      }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Setting row heights in spreadsheet ${args.spreadsheetId}`);

      try {
        const sheetId = await SheetsHelpers.resolveSheetId(
          sheets,
          args.spreadsheetId,
          args.sheetName
        );

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: args.spreadsheetId,
          requestBody: {
            requests: [
              {
                updateDimensionProperties: {
                  range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: args.startRow - 1,
                    endIndex: args.endRow,
                  },
                  properties: { pixelSize: args.pixelSize },
                  fields: 'pixelSize',
                },
              },
            ],
          },
        });

        return `Successfully set rows ${args.startRow}–${args.endRow} to ${args.pixelSize}px height.`;
      } catch (error: any) {
        log.error(`Error setting row heights: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to set row heights: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
