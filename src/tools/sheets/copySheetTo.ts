import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'copySheetTo',
    description:
      'Copies a sheet (tab) from one spreadsheet to another spreadsheet. Use getSpreadsheetInfo to find the numeric sheet ID. The copied sheet will be appended to the destination spreadsheet.',
    parameters: z.object({
      sourceSpreadsheetId: z.string().describe('The spreadsheet ID of the source file.'),
      sheetId: z
        .number()
        .int()
        .describe('The numeric sheet ID to copy. Use getSpreadsheetInfo to find sheet IDs.'),
      destinationSpreadsheetId: z.string().describe('The spreadsheet ID of the destination file.'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(
        `Copying sheet ${args.sheetId} from ${args.sourceSpreadsheetId} to ${args.destinationSpreadsheetId}`
      );

      try {
        const response = await sheets.spreadsheets.sheets.copyTo({
          spreadsheetId: args.sourceSpreadsheetId,
          sheetId: args.sheetId,
          requestBody: { destinationSpreadsheetId: args.destinationSpreadsheetId },
        });

        const props = response.data;
        return `Successfully copied sheet to destination as "${props.title}" (Sheet ID: ${props.sheetId}).`;
      } catch (error: any) {
        log.error(`Error copying sheet: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to copy sheet: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
