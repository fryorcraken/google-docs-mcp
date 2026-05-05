import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { gmail_v1 } from 'googleapis';
import { getGmailClient } from '../../clients.js';
import { findHeaderValue, extractMessageBody, extractDomain } from './helpers.js';

// "reschedul" is intentionally truncated to catch both "reschedule" and "rescheduling".
const MEETING_KEYWORD_PATTERN =
  /\b(meeting|call|invite|invitation|calendar|schedule|reschedul|zoom|google meet|teams)\b/i;
const QUESTION_PATTERN = /\?/;
const ACTION_PATTERN =
  /\b(please|could you|can you|let me know|need|review|approve|sign|deadline|by (mon|tue|wed|thu|fri|sat|sun|today|tomorrow|next week|eod|cob))\b/i;

function extractTextBody(payload?: gmail_v1.Schema$MessagePart): string {
  const { text, html } = extractMessageBody(payload);
  if (text) return text;
  // No text/plain part — strip HTML tags as a best-effort fallback so the
  // heuristic regexes still have something to match against.
  return html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/g, ' ');
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max) + '…';
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'triageInbox',
    description:
      "Composite tool: fetches the user's most recent unread Gmail messages with full content and heuristic categorization in a single call. Returns headers, body excerpts, labels, plus per-message signals (newsletter, meeting reference, contains question, action requested) AND aggregate stats (total unread, top senders, breakdown by category). Designed for AI inbox triage workflows — use the returned data to decide which messages need a reply, can be archived, or warrant a draft response. Pairs naturally with createDraft, modifyMessageLabels, and trashMessage.",
    parameters: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe('How many unread messages to triage in one pass (1-50). Defaults to 20.'),
      additionalQuery: z
        .string()
        .optional()
        .describe(
          'Optional Gmail query appended to "is:unread", e.g. "newer_than:2d" or "-from:notifications@".'
        ),
      bodyExcerptLength: z
        .number()
        .int()
        .min(0)
        .max(2000)
        .optional()
        .default(400)
        .describe('Max characters of body text to include per message (0 to skip bodies).'),
    }),
    execute: async (args, { log }) => {
      const gmail = await getGmailClient();
      const query = ['is:unread', args.additionalQuery].filter(Boolean).join(' ');
      log.info(`Triaging inbox (max=${args.maxResults}, q="${query}")`);

      try {
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          maxResults: args.maxResults,
          q: query,
        });

        const totalUnread = listResponse.data.resultSizeEstimate ?? 0;
        const messageRefs = listResponse.data.messages ?? [];

        if (messageRefs.length === 0) {
          return JSON.stringify(
            {
              summary: {
                totalUnread,
                fetched: 0,
                topSenders: [],
                newsletterCount: 0,
                meetingReferenceCount: 0,
                questionCount: 0,
                actionRequestedCount: 0,
              },
              messages: [],
            },
            null,
            2
          );
        }

        // allSettled so a single failed message fetch doesn't kill the whole
        // triage — partial results are still actionable for the agent.
        const settled = await Promise.allSettled(
          messageRefs.map((ref) =>
            gmail.users.messages.get({
              userId: 'me',
              id: ref.id!,
              format: 'full',
            })
          )
        );

        const failedFetches = settled.filter((r) => r.status === 'rejected').length;
        const detailed: gmail_v1.Schema$Message[] = [];
        for (const r of settled) {
          if (r.status === 'fulfilled') detailed.push(r.value.data);
        }

        const messages = detailed.map((msg) => {
          const headers = msg.payload?.headers;
          const from = findHeaderValue(headers, 'From');
          const subject = findHeaderValue(headers, 'Subject') ?? '(no subject)';
          // Standard newsletter headers per RFC 2369 (List-Unsubscribe) and RFC 2919 (List-Id).
          const hasUnsubscribe =
            findHeaderValue(headers, 'List-Unsubscribe') !== null ||
            findHeaderValue(headers, 'List-Id') !== null;
          const text = args.bodyExcerptLength > 0 ? extractTextBody(msg.payload) : '';
          const bodyExcerpt =
            args.bodyExcerptLength > 0 ? truncate(text, args.bodyExcerptLength) : '';
          const searchSurface = `${subject} ${text}`;

          return {
            id: msg.id,
            threadId: msg.threadId,
            from,
            domain: extractDomain(from),
            to: findHeaderValue(headers, 'To'),
            subject,
            date: findHeaderValue(headers, 'Date'),
            snippet: msg.snippet ?? '',
            bodyExcerpt,
            labels: msg.labelIds ?? [],
            isNewsletter: hasUnsubscribe,
            containsMeetingReference: MEETING_KEYWORD_PATTERN.test(searchSurface),
            containsQuestion: QUESTION_PATTERN.test(searchSurface),
            actionRequested: ACTION_PATTERN.test(searchSurface),
          };
        });

        const senderCounts = new Map<string, number>();
        for (const m of messages) {
          if (!m.from) continue;
          senderCounts.set(m.from, (senderCounts.get(m.from) ?? 0) + 1);
        }
        const topSenders = [...senderCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([from, count]) => ({ from, count }));

        const summary = {
          totalUnread,
          fetched: messages.length,
          failedFetches,
          topSenders,
          newsletterCount: messages.filter((m) => m.isNewsletter).length,
          meetingReferenceCount: messages.filter((m) => m.containsMeetingReference).length,
          questionCount: messages.filter((m) => m.containsQuestion).length,
          actionRequestedCount: messages.filter((m) => m.actionRequested).length,
        };

        return JSON.stringify({ summary, messages }, null, 2);
      } catch (error: any) {
        log.error(`Error triaging inbox: ${error.message || error}`);
        if (error.code === 401)
          throw new UserError(
            'Gmail authorization failed. Re-authorize to grant the gmail.modify scope.'
          );
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the gmail.modify scope was granted.');
        throw new UserError(`Failed to triage inbox: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
