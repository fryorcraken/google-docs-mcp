import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../../clients.js';
import { DocumentIdParameter } from '../../../types.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';

const DonorByText = z.object({
  textToFind: z
    .string()
    .min(1)
    .describe(
      'Exact text in the donor paragraph — a paragraph already in the list whose bullet you want the new item to inherit.'
    ),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Which instance of textToFind to use as the donor (1-based, defaults to 1).'),
});

const DonorByIndex = z.object({
  indexWithinDonor: z
    .number()
    .int()
    .min(1)
    .describe('Any index within the donor paragraph (the paragraph already in the target list).'),
});

const AddListItemParameters = DocumentIdParameter.extend({
  donor: z
    .union([DonorByText, DonorByIndex])
    .describe(
      'A paragraph that is already in the list you want the new item to belong to. The Google Docs API has no direct "attach to existing list" operation; this tool uses the only mechanism that works — splitting the donor via newline insertion — so the new item inherits the donor\'s listId and nestingLevel.'
    ),
  text: z
    .string()
    .min(1)
    .describe(
      'The text content for the new list item (without bullet markers — bullets are inherited from the donor).'
    ),
  tabId: z
    .string()
    .optional()
    .describe(
      "Optional tab ID (format 't.xxxxxx'). If omitted on a tabbed document, defaults to the first tab."
    ),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'addListItem',
    description:
      'Adds a new list item immediately after an existing list item (the "donor"). The new item inherits the donor\'s bullet — including custom glyphs (e.g. a literal "-") that no built-in preset reproduces. ' +
      'This is the canonical fix for "I need to add an item to an existing custom-glyph list but appendMarkdown / updateParagraphBullets keep creating a fresh list with the wrong glyph". ' +
      'Constraint: the new item lands directly after the donor — the Docs API has no operation to attach an arbitrary paragraph to a specific listId, so positional control is bounded by where suitable donors exist. To insert into the middle of a list, pick the donor item that the new one should follow.',
    parameters: AddListItemParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);
      const effectiveTabId = tab.tabId;

      log.info(
        `addListItem on doc ${args.documentId}${effectiveTabId ? ` (tab: ${effectiveTabId})` : ''}`
      );

      // Find the donor paragraph's range. We need a paragraph boundary so
      // we can splice text into the right slot.
      let donorIndex: number;
      if ('textToFind' in args.donor) {
        const found = await GDocsHelpers.findTextRange(
          docs,
          args.documentId,
          args.donor.textToFind,
          args.donor.matchInstance ?? 1,
          effectiveTabId
        );
        if (!found) {
          throw new UserError(
            `Could not find donor text "${args.donor.textToFind}" (instance ${args.donor.matchInstance ?? 1})${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}.`
          );
        }
        donorIndex = found.startIndex;
      } else {
        donorIndex = args.donor.indexWithinDonor;
      }

      const donorParagraph = await GDocsHelpers.getParagraphRange(
        docs,
        args.documentId,
        donorIndex,
        effectiveTabId
      );
      if (!donorParagraph) {
        throw new UserError('Could not determine donor paragraph boundaries.');
      }

      // Inheritance trick: insert `\n<text>` INSIDE the donor paragraph,
      // just before its trailing newline (at endIndex - 1). The Docs API
      // splits the donor at the inserted newline, and per the API spec
      // "The paragraph style of the new paragraph will be copied from
      // the paragraph at the current insertion index, including lists
      // and bullets" — so the new paragraph inherits the donor's
      // bullet.listId and nestingLevel verbatim.
      const newlineBeforeEnd = donorParagraph.endIndex - 1;
      const insertLocation: docs_v1.Schema$Location = { index: newlineBeforeEnd };
      if (effectiveTabId) insertLocation.tabId = effectiveTabId;

      await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [
        { insertText: { location: insertLocation, text: `\n${args.text}` } },
      ]);

      return `Added new list item after donor at paragraph ${donorParagraph.startIndex}-${donorParagraph.endIndex}${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}. The new item inherits the donor's bullet style.`;
    },
  });
}
