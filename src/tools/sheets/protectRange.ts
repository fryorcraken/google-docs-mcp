import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'protectRange',
    description:
      "Locks (protects) a range or an entire sheet to prevent accidental edits. Optionally specify a description. The protection applies to the authenticated user's account.",
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
      range: z
        .string()
        .optional()
        .describe(
          'A1 notation range to protect (e.g., "A1:D10", "1:1"). Omit to protect the entire sheet.'
        ),
      description: z
        .string()
        .optional()
        .describe(
          'Human-readable description for this protection (e.g., "Header row — do not edit").'
        ),
      warningOnly: z
        .boolean()
        .optional()
        .describe(
          'If true, shows a warning when editing but does not block it. Defaults to false (fully locked).'
        ),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Protecting range in spreadsheet ${args.spreadsheetId}`);

      try {
        const sheetId = await SheetsHelpers.resolveSheetId(
          sheets,
          args.spreadsheetId,
          args.sheetName
        );

        const protectedRange: sheets_v4.Schema$ProtectedRange = {
          description: args.description ?? '',
          warningOnly: args.warningOnly ?? false,
          range: args.range ? SheetsHelpers.parseA1ToGridRange(args.range, sheetId) : { sheetId },
        };

        const response = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: args.spreadsheetId,
          requestBody: {
            requests: [{ addProtectedRange: { protectedRange } }],
          },
        });

        const result = response.data.replies?.[0]?.addProtectedRange?.protectedRange;
        const target = args.range ? `range "${args.range}"` : 'entire sheet';
        const mode = args.warningOnly ? 'warning-only' : 'fully locked';
        return `Successfully protected ${target} (Protection ID: ${result?.protectedRangeId}, mode: ${mode}).`;
      } catch (error: any) {
        log.error(`Error protecting range: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to protect range: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
