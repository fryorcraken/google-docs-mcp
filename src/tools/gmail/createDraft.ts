import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { prepareMimeRequest } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createDraft',
    description:
      'Creates a Gmail draft (does NOT send). Use this for AI-composed emails that the user should review before sending. The draft appears in the Gmail Drafts folder and can be sent later with sendDraft, edited with updateDraft, or deleted with deleteDraft. Supports threading via replyToMessageId.',
    parameters: z.object({
      to: z
        .union([z.string(), z.array(z.string()).min(1)])
        .describe('Recipient email address, or an array of recipient email addresses.'),
      subject: z.string().describe('Email subject line.'),
      body: z.string().describe('Plain-text body of the draft.'),
      cc: z.array(z.string()).optional().describe('Optional list of Cc recipients.'),
      bcc: z.array(z.string()).optional().describe('Optional list of Bcc recipients.'),
      replyToMessageId: z
        .string()
        .optional()
        .describe(
          'Optional Gmail message ID to draft a reply to. The draft is threaded with the original.'
        ),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();

      try {
        const { raw, threadId, toList } = await prepareMimeRequest(gmail, args);
        log.info(
          `Creating Gmail draft to ${toList.join(', ')}${
            args.replyToMessageId ? ` (reply to ${args.replyToMessageId})` : ''
          }`
        );

        const response = await gmail.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: {
              raw,
              ...(threadId ? { threadId } : {}),
            },
          },
        });

        return JSON.stringify(
          {
            success: true,
            draftId: response.data.id,
            messageId: response.data.message?.id,
            threadId: response.data.message?.threadId,
            to: toList,
            subject: args.subject,
            message: `Draft created. Use sendDraft with draftId="${response.data.id}" to send it, or updateDraft to edit it first.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error creating draft: ${error.message || error}`);
        if (error.code === 401)
          throw new UserError(
            'Gmail authorization failed. Re-authorize to grant the gmail.modify scope.'
          );
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        if (error.code === 400)
          throw new UserError(`Gmail rejected the draft: ${error.message || 'Bad request'}`);
        throw new UserError(`Failed to create draft: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
