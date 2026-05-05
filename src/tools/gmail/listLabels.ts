import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listLabels',
    description:
      'Lists all Gmail labels for the authenticated user, including system labels (INBOX, SENT, STARRED, UNREAD, etc.) and custom user-created labels. Use the returned IDs with modifyMessageLabels or listMessages labelIds filter.',
    parameters: z.object({}),
    execute: async (_args, { log }) => {
      const gmail = await getGmailClient();
      log.info('Listing Gmail labels');

      try {
        const response = await gmail.users.labels.list({ userId: 'me' });
        const labels = (response.data.labels ?? []).map((label) => ({
          id: label.id,
          name: label.name,
          type: label.type,
          messageListVisibility: label.messageListVisibility,
          labelListVisibility: label.labelListVisibility,
        }));

        return JSON.stringify({ labels, count: labels.length }, null, 2);
      } catch (error: any) {
        log.error(`Error listing Gmail labels: ${error.message || error}`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to list Gmail labels: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
