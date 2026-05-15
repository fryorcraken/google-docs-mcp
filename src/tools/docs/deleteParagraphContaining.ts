import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, OptionalTabIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

const DeleteParagraphContainingParameters = DocumentIdParameter.extend({
  textToFind: z
    .string()
    .min(1)
    .describe(
      'Exact text in the paragraph to delete. The ENTIRE paragraph containing this text (including its trailing newline) is removed.'
    ),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Which instance of textToFind to use (1-based, defaults to 1).'),
}).merge(OptionalTabIdParameter);

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteParagraphContaining',
    description:
      'Deletes the entire paragraph (including its trailing newline) that contains a given text anchor. ' +
      'Wraps the common "readDocument → grep textRun → compute paragraph range → deleteRange" pattern. ' +
      'Re-resolves the anchor from current document state, so it composes safely with other text-anchored edits without manual index bookkeeping.',
    parameters: DeleteParagraphContainingParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);
      const effectiveTabId = tab.tabId;

      log.info(
        `deleteParagraphContaining "${args.textToFind}" (instance ${args.matchInstance ?? 1}) in doc ${args.documentId}${effectiveTabId ? ` (tab: ${effectiveTabId})` : ''}`
      );

      const textRange = await GDocsHelpers.findTextRange(
        docs,
        args.documentId,
        args.textToFind,
        args.matchInstance ?? 1,
        effectiveTabId
      );
      if (!textRange) {
        throw new UserError(
          `Could not find "${args.textToFind}" (instance ${args.matchInstance ?? 1})${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}.`
        );
      }

      const paragraphRange = await GDocsHelpers.getParagraphRange(
        docs,
        args.documentId,
        textRange.startIndex,
        effectiveTabId
      );
      if (!paragraphRange) {
        throw new UserError(
          `Found "${args.textToFind}" but could not locate its paragraph boundaries.`
        );
      }

      const range: docs_v1.Schema$Range = {
        startIndex: paragraphRange.startIndex,
        endIndex: paragraphRange.endIndex,
      };
      if (effectiveTabId) range.tabId = effectiveTabId;

      await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [
        { deleteContentRange: { range } },
      ]);

      return `Deleted paragraph at ${paragraphRange.startIndex}-${paragraphRange.endIndex}${effectiveTabId ? ` in tab ${effectiveTabId}` : ''} (matched on "${args.textToFind}").`;
    },
  });
}
