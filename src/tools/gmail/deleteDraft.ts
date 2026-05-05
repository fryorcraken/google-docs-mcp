import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteDraft',
    description:
      'Permanently deletes a Gmail draft. This is irreversible — the draft is removed entirely, not moved to Trash. Use when an AI-composed draft was rejected or replaced.',
    parameters: z.object({
      draftId: z
        .string()
        .describe('The Gmail draft ID to delete (from createDraft or listDrafts).'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Deleting Gmail draft ${args.draftId}`);

      try {
        await gmail.users.drafts.delete({
          userId: 'me',
          id: args.draftId,
        });

        return JSON.stringify(
          {
            success: true,
            draftId: args.draftId,
            message: `Draft ${args.draftId} permanently deleted.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error deleting draft: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Draft not found (ID: ${args.draftId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to delete draft: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
