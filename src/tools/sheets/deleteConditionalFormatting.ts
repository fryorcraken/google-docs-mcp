import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteConditionalFormatting',
    description:
      'Deletes one or more conditional formatting rules from a sheet by their index. Use getConditionalFormatting to list existing rules and their indices.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      sheetName: z
        .string()
        .optional()
        .describe('Name of the sheet/tab. Defaults to the first sheet if not provided.'),
      ruleIndices: z
        .array(z.number().int().min(0))
        .min(1)
        .describe(
          'Array of rule indices to delete (0-based, from getConditionalFormatting). Order does not matter — the tool sorts automatically.'
        ),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Deleting conditional formatting rules from spreadsheet ${args.spreadsheetId}`);

      try {
        const sheetId = await SheetsHelpers.resolveSheetId(
          sheets,
          args.spreadsheetId,
          args.sheetName
        );

        // Sort descending to avoid index shifting during batch delete
        const indices = [...args.ruleIndices].sort((a, b) => b - a);

        const requests = indices.map((index) => ({
          deleteConditionalFormatRule: { sheetId, index },
        }));

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: args.spreadsheetId,
          requestBody: { requests },
        });

        return `Successfully deleted ${indices.length} conditional formatting rule(s) at indices: ${args.ruleIndices.join(', ')}.`;
      } catch (error: any) {
        log.error(`Error deleting conditional formatting: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to delete conditional formatting: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
