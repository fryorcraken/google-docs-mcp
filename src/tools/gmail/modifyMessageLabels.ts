import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'modifyMessageLabels',
    description:
      'Adds and/or removes labels on a Gmail message. Use this to star (add STARRED), archive (remove INBOX), mark read (remove UNREAD), or apply custom labels. Discover label IDs with listLabels. At least one of addLabelIds or removeLabelIds must be provided.',
    parameters: z
      .object({
        messageId: z.string().describe('The Gmail message ID to modify.'),
        addLabelIds: z
          .array(z.string())
          .optional()
          .describe(
            'Label IDs to add (e.g. ["STARRED"], ["IMPORTANT"], or a custom label ID from listLabels).'
          ),
        removeLabelIds: z
          .array(z.string())
          .optional()
          .describe('Label IDs to remove (e.g. ["INBOX"] to archive, ["UNREAD"] to mark as read).'),
      })
      .refine(
        (v) =>
          (v.addLabelIds && v.addLabelIds.length > 0) ||
          (v.removeLabelIds && v.removeLabelIds.length > 0),
        { message: 'Provide at least one of addLabelIds or removeLabelIds.' }
      ),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(
        `Modifying labels on ${args.messageId} (add=${args.addLabelIds?.join(',') ?? 'none'}, remove=${
          args.removeLabelIds?.join(',') ?? 'none'
        })`
      );

      try {
        const response = await gmail.users.messages.modify({
          userId: 'me',
          id: args.messageId,
          requestBody: {
            addLabelIds: args.addLabelIds,
            removeLabelIds: args.removeLabelIds,
          },
        });

        return JSON.stringify(
          {
            success: true,
            id: response.data.id,
            threadId: response.data.threadId,
            labelIds: response.data.labelIds ?? [],
            message: `Labels updated on message ${args.messageId}.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error modifying labels: ${error.message || error}`);
        if (error.code === 404)
          throw new UserError(
            `Gmail message or label not found. Verify messageId and label IDs (use listLabels).`
          );
        if (error.code === 400)
          throw new UserError(
            `Gmail rejected the label change: ${error.message || 'Bad request'}. Some system labels (e.g. DRAFT, SENT) cannot be applied manually.`
          );
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to modify labels: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
