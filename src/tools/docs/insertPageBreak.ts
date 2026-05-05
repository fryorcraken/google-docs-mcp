import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertPageBreak',
    description: 'Inserts a page break at a character index in the document.',
    parameters: DocumentIdParameter.extend({
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
          'The ID of the specific tab to insert into. Use listDocumentTabs to get tab IDs. If not specified, inserts into the first tab.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Inserting page break in doc ${args.documentId} at index ${args.index}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );
      try {
        const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);

        const location: docs_v1.Schema$Location = { index: args.index };
        if (tab.tabId) {
          location.tabId = tab.tabId;
        }

        const request: docs_v1.Schema$Request = {
          insertPageBreak: { location },
        };
        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);
        return `Successfully inserted page break at index ${args.index}${tab.tabId ? ` in tab ${tab.tabId}` : ''}.`;
      } catch (error: any) {
        log.error(
          `Error inserting page break in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to insert page break: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
