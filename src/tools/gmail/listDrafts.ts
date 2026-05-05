import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { findHeaderValue } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listDrafts',
    description:
      'Lists Gmail drafts for the authenticated user. Returns draft IDs along with the recipient, subject, snippet, and date for each. Use sendDraft, updateDraft, or deleteDraft to act on a returned draft.',
    parameters: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe('Maximum number of drafts to return (1-100). Defaults to 25.'),
      q: z
        .string()
        .optional()
        .describe('Optional Gmail search query to filter drafts (e.g. "subject:proposal").'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Listing Gmail drafts (max=${args.maxResults})`);

      try {
        const listResponse = await gmail.users.drafts.list({
          userId: 'me',
          maxResults: args.maxResults,
          q: args.q,
        });

        const draftRefs = listResponse.data.drafts ?? [];
        if (draftRefs.length === 0) {
          return JSON.stringify(
            {
              drafts: [],
              resultSizeEstimate: listResponse.data.resultSizeEstimate ?? 0,
              nextPageToken: listResponse.data.nextPageToken ?? null,
            },
            null,
            2
          );
        }

        const detailed = await Promise.all(
          draftRefs.map((ref) =>
            gmail.users.drafts.get({
              userId: 'me',
              id: ref.id!,
              format: 'metadata',
            })
          )
        );

        const drafts = detailed.map((response) => {
          const draft = response.data;
          const msg = draft.message;
          const headers = msg?.payload?.headers;
          return {
            draftId: draft.id,
            messageId: msg?.id,
            threadId: msg?.threadId,
            snippet: msg?.snippet ?? '',
            to: findHeaderValue(headers, 'To'),
            cc: findHeaderValue(headers, 'Cc'),
            subject: findHeaderValue(headers, 'Subject'),
            date: findHeaderValue(headers, 'Date'),
          };
        });

        return JSON.stringify(
          {
            drafts,
            resultSizeEstimate: listResponse.data.resultSizeEstimate ?? drafts.length,
            nextPageToken: listResponse.data.nextPageToken ?? null,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error listing drafts: ${error.message || error}`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to list drafts: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
