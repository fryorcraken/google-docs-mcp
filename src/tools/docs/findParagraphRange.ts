import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, OptionalTabIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

const ByText = z.object({
  textToFind: z.string().min(1).describe('Exact text contained in the target paragraph.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Which instance of textToFind to use (1-based, defaults to 1).'),
});

const ByIndex = z.object({
  indexWithinParagraph: z.number().int().min(1).describe('Any index inside the target paragraph.'),
});

const FindParagraphRangeParameters = DocumentIdParameter.extend({
  target: z
    .union([ByText, ByIndex])
    .describe(
      'Specify the paragraph by an exact text it contains, or by any index inside it. Returns the full paragraph range [startIndex, endIndex) including its trailing newline.'
    ),
}).merge(OptionalTabIdParameter);

export function register(server: FastMCP) {
  server.addTool({
    name: 'findParagraphRange',
    description:
      'Pure read helper: returns the full [startIndex, endIndex) range of the paragraph containing a given text anchor or index, including its trailing newline. ' +
      'Use this when you need raw indices for low-level tools (deleteRange, applyParagraphStyle, etc.) without the readDocument → JSON-grep → arithmetic detour.',
    parameters: FindParagraphRangeParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);
      const effectiveTabId = tab.tabId;

      log.info(
        `findParagraphRange on doc ${args.documentId}${effectiveTabId ? ` (tab: ${effectiveTabId})` : ''}`
      );

      let indexWithin: number;
      if ('textToFind' in args.target) {
        const textRange = await GDocsHelpers.findTextRange(
          docs,
          args.documentId,
          args.target.textToFind,
          args.target.matchInstance ?? 1,
          effectiveTabId
        );
        if (!textRange) {
          throw new UserError(
            `Could not find "${args.target.textToFind}" (instance ${args.target.matchInstance ?? 1})${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}.`
          );
        }
        indexWithin = textRange.startIndex;
      } else {
        indexWithin = args.target.indexWithinParagraph;
      }

      const paragraphRange = await GDocsHelpers.getParagraphRange(
        docs,
        args.documentId,
        indexWithin,
        effectiveTabId
      );
      if (!paragraphRange) {
        throw new UserError(
          `Could not determine paragraph boundaries for index ${indexWithin}${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}.`
        );
      }

      return JSON.stringify({
        startIndex: paragraphRange.startIndex,
        endIndex: paragraphRange.endIndex,
        tabId: effectiveTabId ?? null,
      });
    },
  });
}
