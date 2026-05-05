import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { google } from 'googleapis';
import { getAuthClient } from '../../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'resolveSheetsComment',
    description:
      'Marks a comment as resolved in a Google Spreadsheet. Note: resolved status may not persist in the Sheets UI due to a Drive API limitation.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      commentId: z.string().describe('The ID of the comment to resolve.'),
    }),
    execute: async (args, { log }) => {
      log.info(`Resolving comment ${args.commentId} in spreadsheet ${args.spreadsheetId}`);

      try {
        const authClient = await getAuthClient();
        const drive = google.drive({ version: 'v3', auth: authClient });

        const currentComment = await drive.comments.get({
          fileId: args.spreadsheetId,
          commentId: args.commentId,
          fields: 'content',
        });

        await drive.comments.update({
          fileId: args.spreadsheetId,
          commentId: args.commentId,
          fields: 'id,resolved',
          requestBody: {
            content: currentComment.data.content,
            resolved: true,
          },
        });

        const verifyComment = await drive.comments.get({
          fileId: args.spreadsheetId,
          commentId: args.commentId,
          fields: 'resolved',
        });

        if (verifyComment.data.resolved) {
          return `Comment ${args.commentId} has been marked as resolved.`;
        } else {
          return `Attempted to resolve comment ${args.commentId}, but the resolved status may not persist in the Sheets UI due to API limitations. The comment can be resolved manually in the Google Sheets interface.`;
        }
      } catch (error: any) {
        log.error(`Error resolving sheets comment: ${error.message || error}`);
        const errorDetails =
          error.response?.data?.error?.message || error.message || 'Unknown error';
        throw new UserError(`Failed to resolve comment: ${errorDetails}`);
      }
    },
  });
}
