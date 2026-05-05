import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { google } from 'googleapis';
import { getAuthClient } from '../../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteSheetsComment',
    description: 'Permanently deletes a comment and all its replies from a Google Spreadsheet.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      commentId: z.string().describe('The ID of the comment to delete.'),
    }),
    execute: async (args, { log }) => {
      log.info(`Deleting comment ${args.commentId} from spreadsheet ${args.spreadsheetId}`);

      try {
        const authClient = await getAuthClient();
        const drive = google.drive({ version: 'v3', auth: authClient });

        await drive.comments.delete({
          fileId: args.spreadsheetId,
          commentId: args.commentId,
        });

        return `Comment ${args.commentId} has been deleted.`;
      } catch (error: any) {
        log.error(`Error deleting sheets comment: ${error.message || error}`);
        throw new UserError(`Failed to delete comment: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
