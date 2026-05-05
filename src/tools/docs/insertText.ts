import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertText',
    description:
      "Inserts text at a specific character index within a document. Use readDocument with format='json' to determine the correct index.",
    parameters: DocumentIdParameter.extend({
      text: z.string().min(1).describe('The text to insert.'),
      index: z
        .number()
        .int()
        .min(1)
        .describe(
          "1-based character index within the document body. Use readDocument with format='json' to inspect indices."
        ),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab to insert into. If not specified, inserts into the first tab (or legacy document.body for documents without tabs).'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Inserting text in doc ${args.documentId} at index ${args.index}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );
      try {
        // Auto-detect tabbed docs even when caller doesn't pass tabId. This
        // is the issue #1 bug class: a user inserting into a tabbed doc
        // without knowing it was tabbed previously hit "appears empty" or
        // the comment-field validation error from the Docs API.
        const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);

        if (tab.isTabbed) {
          const location: docs_v1.Schema$Location = {
            index: args.index,
            tabId: tab.tabId!,
          };
          const request: docs_v1.Schema$Request = {
            insertText: { location, text: args.text },
          };
          await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);
          return `Successfully inserted text at index ${args.index} in tab ${tab.tabId}.`;
        }

        // Non-tabbed doc — use the legacy path.
        await GDocsHelpers.insertText(docs, args.documentId, args.text, args.index);
        return `Successfully inserted text at index ${args.index}.`;
      } catch (error: any) {
        log.error(`Error inserting text in doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to insert text: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
