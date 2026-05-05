import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'sendDraft',
    description:
      'Sends an existing Gmail draft. After sending, the draft is removed and the message appears in Sent. This is the second half of the compose-review-send flow that pairs with createDraft.',
    parameters: z.object({
      draftId: z.string().describe('The Gmail draft ID to send (from createDraft or listDrafts).'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Sending Gmail draft ${args.draftId}`);

      try {
        const response = await gmail.users.drafts.send({
          userId: 'me',
          requestBody: {
            id: args.draftId,
          },
        });

        return JSON.stringify(
          {
            success: true,
            draftId: args.draftId,
            messageId: response.data.id,
            threadId: response.data.threadId,
            labelIds: response.data.labelIds ?? [],
            message: `Draft ${args.draftId} sent. Message ID: ${response.data.id}.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error sending draft: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Draft not found (ID: ${args.draftId}).`);
        if (error.code === 403)
          throw new UserError(
            'Permission denied. The account does not have permission to send mail via this OAuth client.'
          );
        if (error.code === 400)
          throw new UserError(
            `Gmail rejected the send: ${error.message || 'Bad request'}. Verify the draft has at least one recipient and a subject.`
          );
        throw new UserError(`Failed to send draft: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
