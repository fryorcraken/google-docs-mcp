import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { gmail_v1 } from 'googleapis';
import { getGmailClient } from '../../clients.js';
import { findHeaderValue, extractMessageBody } from './helpers.js';

function collectAttachments(payload?: gmail_v1.Schema$MessagePart): Array<{
  partId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
}> {
  const out: ReturnType<typeof collectAttachments> = [];
  if (!payload) return out;
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (part.filename && part.body?.attachmentId) {
      out.push({
        partId: part.partId ?? null,
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId ?? null,
      });
    }
    if (part.parts) for (const sub of part.parts) walk(sub);
  };
  walk(payload);
  return out;
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'getMessage',
    description:
      'Fetches a single Gmail message by ID with headers, decoded plain-text body, HTML body, and a list of attachments (metadata only). Use listMessages to discover message IDs.',
    parameters: z.object({
      messageId: z.string().describe('The Gmail message ID, typically from listMessages results.'),
      format: z
        .enum(['full', 'metadata', 'minimal'])
        .optional()
        .default('full')
        .describe(
          '"full" returns headers + body + attachments; "metadata" returns headers only; "minimal" returns just labels/snippet.'
        ),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      log.info(`Getting Gmail message ${args.messageId} (format=${args.format})`);

      try {
        const response = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: args.format,
        });

        const msg = response.data;
        const headers = msg.payload?.headers;

        const base = {
          id: msg.id,
          threadId: msg.threadId,
          labelIds: msg.labelIds ?? [],
          snippet: msg.snippet ?? '',
          historyId: msg.historyId,
          internalDate: msg.internalDate,
          sizeEstimate: msg.sizeEstimate,
        };

        if (args.format === 'minimal') {
          return JSON.stringify(base, null, 2);
        }

        const headerSummary = {
          from: findHeaderValue(headers, 'From'),
          to: findHeaderValue(headers, 'To'),
          cc: findHeaderValue(headers, 'Cc'),
          bcc: findHeaderValue(headers, 'Bcc'),
          subject: findHeaderValue(headers, 'Subject'),
          date: findHeaderValue(headers, 'Date'),
          messageIdHeader: findHeaderValue(headers, 'Message-Id'),
        };

        if (args.format === 'metadata') {
          return JSON.stringify({ ...base, headers: headerSummary }, null, 2);
        }

        const { text, html } = extractMessageBody(msg.payload);
        const attachments = collectAttachments(msg.payload);

        return JSON.stringify(
          {
            ...base,
            headers: headerSummary,
            body: { text, html },
            attachments,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error getting Gmail message: ${error.message || error}`);
        if (error.code === 404)
          throw new UserError(`Gmail message not found (ID: ${args.messageId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to get Gmail message: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
