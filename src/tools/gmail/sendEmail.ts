import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getGmailClient } from '../../clients.js';
import { prepareMimeRequest } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'sendEmail',
    description:
      'Sends a plain-text email from the authenticated Gmail account. Supports cc/bcc and optional threading by passing replyToMessageId (which copies threadId and sets In-Reply-To/References so the reply lands in the same thread).',
    parameters: z.object({
      to: z
        .union([z.string(), z.array(z.string()).min(1)])
        .describe('Recipient email address, or an array of recipient email addresses.'),
      subject: z.string().describe('Email subject line.'),
      body: z.string().describe('Plain-text body of the email.'),
      cc: z.array(z.string()).optional().describe('Optional list of Cc recipients.'),
      bcc: z.array(z.string()).optional().describe('Optional list of Bcc recipients.'),
      replyToMessageId: z
        .string()
        .optional()
        .describe(
          'Optional Gmail message ID to reply to. When set, the new email is threaded with the original and uses In-Reply-To/References headers.'
        ),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();

      try {
        const { raw, threadId, toList } = await prepareMimeRequest(gmail, args);
        log.info(
          `Sending Gmail message to ${toList.join(', ')}${
            args.replyToMessageId ? ` (reply to ${args.replyToMessageId})` : ''
          }`
        );

        const send = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw,
            ...(threadId ? { threadId } : {}),
          },
        });

        return JSON.stringify(
          {
            success: true,
            id: send.data.id,
            threadId: send.data.threadId,
            labelIds: send.data.labelIds ?? [],
            to: toList,
            subject: args.subject,
            message: `Email sent to ${toList.join(', ')}.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error sending Gmail message: ${error.message || error}`);
        if (error.code === 401)
          throw new UserError(
            'Gmail authorization failed. Re-authorize to grant the gmail.modify scope.'
          );
        if (error.code === 403)
          throw new UserError(
            'Permission denied. The account does not have permission to send mail via this OAuth client.'
          );
        if (error.code === 400)
          throw new UserError(`Gmail rejected the message: ${error.message || 'Bad request'}`);
        throw new UserError(`Failed to send email: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
