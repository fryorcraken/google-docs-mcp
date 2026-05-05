import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { google } from 'googleapis';
import { getAuthClient } from '../../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replyToSheetsComment',
    description:
      'Adds a reply to an existing comment thread in a Google Spreadsheet. Use listSheetsComments or getSheetsComment to find the comment ID.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      commentId: z.string().describe('The ID of the comment to reply to.'),
      content: z.string().min(1).describe('The text content of the reply.'),
    }),
    execute: async (args, { log }) => {
      log.info(`Adding reply to comment ${args.commentId} in spreadsheet ${args.spreadsheetId}`);

      try {
        const authClient = await getAuthClient();
        const drive = google.drive({ version: 'v3', auth: authClient });

        const response = await drive.replies.create({
          fileId: args.spreadsheetId,
          commentId: args.commentId,
          fields: 'id,content,author,createdTime',
          requestBody: {
            content: args.content,
          },
        });

        return `Reply added successfully. Reply ID: ${response.data.id}`;
      } catch (error: any) {
        log.error(`Error adding reply to sheets comment: ${error.message || error}`);
        throw new UserError(`Failed to add reply: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
