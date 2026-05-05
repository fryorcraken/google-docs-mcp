import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replaceAllText',
    description:
      'Replaces every occurrence of `findText` with `replaceText` across all slides in the presentation. Use to swap placeholders such as {{NAME}} → "Alice". Returns the number of replacements made.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      findText: z.string().min(1).describe('Exact text to find.'),
      replaceText: z.string().describe('Text to substitute. Empty string deletes the matches.'),
      matchCase: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether the search is case-sensitive. Default false.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `replaceAllText in ${args.presentationId}: "${args.findText}" → "${args.replaceText}" (matchCase=${args.matchCase})`
      );
      const res = await executeBatchUpdate(
        slides,
        args.presentationId,
        [
          {
            replaceAllText: {
              containsText: { text: args.findText, matchCase: args.matchCase },
              replaceText: args.replaceText,
            },
          },
        ],
        'replace all text'
      );
      const occurrences = res.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
      return JSON.stringify({ occurrencesChanged: occurrences }, null, 2);
    },
  });
}
