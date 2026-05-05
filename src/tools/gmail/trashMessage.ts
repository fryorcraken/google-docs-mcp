import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'trashMessage',
    description:
      'Moves a Gmail message to Trash. This is the same as clicking Delete in the Gmail UI — reversible from the Trash folder for 30 days. Not a permanent delete.',
    parameters: z.object({
      messageId: z.string().describe('The Gmail message ID to move to Trash.'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Trashing Gmail message ${args.messageId}`);

      try {
        const response = await gmail.users.messages.trash({
          userId: 'me',
          id: args.messageId,
        });

        return JSON.stringify(
          {
            success: true,
            id: response.data.id,
            threadId: response.data.threadId,
            labelIds: response.data.labelIds ?? [],
            message: `Message ${args.messageId} moved to Trash. Recoverable from the Trash folder in the Gmail UI.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error trashing Gmail message: ${error.message || error}`);
        if (error.code === 404)
          throw new UserError(`Gmail message not found (ID: ${args.messageId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to trash message: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
