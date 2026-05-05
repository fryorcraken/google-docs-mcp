import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { findHeaderValue, extractMessageBody } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getDraft',
    description:
      'Fetches a single Gmail draft by ID with full headers and body. Use listDrafts to discover draft IDs.',
    parameters: z.object({
      draftId: z.string().describe('The Gmail draft ID, typically from listDrafts results.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Getting Gmail draft ${args.draftId}`);

      try {
        const response = await gmail.users.drafts.get({
          userId: 'me',
          id: args.draftId,
          format: 'full',
        });

        const draft = response.data;
        const msg = draft.message;
        const headers = msg?.payload?.headers;
        const { text, html } = extractMessageBody(msg?.payload);

        return JSON.stringify(
          {
            draftId: draft.id,
            messageId: msg?.id,
            threadId: msg?.threadId,
            labelIds: msg?.labelIds ?? [],
            snippet: msg?.snippet ?? '',
            headers: {
              from: findHeaderValue(headers, 'From'),
              to: findHeaderValue(headers, 'To'),
              cc: findHeaderValue(headers, 'Cc'),
              bcc: findHeaderValue(headers, 'Bcc'),
              subject: findHeaderValue(headers, 'Subject'),
              date: findHeaderValue(headers, 'Date'),
            },
            body: { text, html },
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error getting draft: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Draft not found (ID: ${args.draftId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to get draft: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
