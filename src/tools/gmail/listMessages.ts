import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { findHeaderValue } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listMessages',
    description:
      'Lists Gmail messages for the authenticated user. Supports the full Gmail search syntax via the q parameter (e.g. "is:unread", "from:alice@example.com", "subject:invoice newer_than:7d"). Returns message IDs with sender, subject, date, and snippet for each result.',
    parameters: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe('Maximum number of messages to return (1-100). Defaults to 10.'),
      q: z
        .string()
        .optional()
        .describe(
          'Gmail search query using the same syntax as the Gmail search box. Examples: "is:unread", "from:boss@acme.com", "has:attachment newer_than:3d".'
        ),
      labelIds: z
        .array(z.string())
        .optional()
        .describe(
          'Only return messages with these label IDs (e.g. ["INBOX"], ["STARRED"]). Use listLabels to discover custom label IDs.'
        ),
      includeSpamTrash: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, also include messages from SPAM and TRASH.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(
        `Listing Gmail messages (max=${args.maxResults}, q=${args.q ?? 'none'}, labels=${
          args.labelIds?.join(',') ?? 'none'
        })`
      );

      try {
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          maxResults: args.maxResults,
          q: args.q,
          labelIds: args.labelIds,
          includeSpamTrash: args.includeSpamTrash,
        });

        const messageRefs = listResponse.data.messages ?? [];
        if (messageRefs.length === 0) {
          return JSON.stringify(
            {
              messages: [],
              resultSizeEstimate: listResponse.data.resultSizeEstimate ?? 0,
              nextPageToken: listResponse.data.nextPageToken ?? null,
            },
            null,
            2
          );
        }

        const detailed = await Promise.all(
          messageRefs.map((ref) =>
            gmail.users.messages.get({
              userId: 'me',
              id: ref.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date'],
            })
          )
        );

        const messages = detailed.map((response) => {
          const msg = response.data;
          const headers = msg.payload?.headers;
          return {
            id: msg.id,
            threadId: msg.threadId,
            labelIds: msg.labelIds ?? [],
            snippet: msg.snippet ?? '',
            from: findHeaderValue(headers, 'From'),
            to: findHeaderValue(headers, 'To'),
            subject: findHeaderValue(headers, 'Subject'),
            date: findHeaderValue(headers, 'Date'),
          };
        });

        return JSON.stringify(
          {
            messages,
            resultSizeEstimate: listResponse.data.resultSizeEstimate ?? messages.length,
            nextPageToken: listResponse.data.nextPageToken ?? null,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error listing Gmail messages: ${error.message || error}`);
        if (error.code === 401)
          throw new UserError(
            'Gmail authorization failed. Re-authorize the MCP server (scopes may have changed).'
          );
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Confirm the Gmail API is enabled and the gmail.modify scope was granted during consent.'
          );
        throw new UserError(`Failed to list Gmail messages: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
