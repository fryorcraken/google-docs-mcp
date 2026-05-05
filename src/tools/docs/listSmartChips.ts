import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import { extractSmartChips } from './smartChipHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listSmartChips',
    description:
      'Lists smart chips in a Google Document, including date elements, person mentions, and rich links.',
    parameters: DocumentIdParameter.extend({
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab to inspect. If not specified, inspects the first tab or legacy document body.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Listing smart chips for ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields:
            'body(content(paragraph(elements(startIndex,endIndex,dateElement(dateId,dateElementProperties),richLink(richLinkId,richLinkProperties),person(personId,personProperties))),table(tableRows(tableCells(content(paragraph(elements(startIndex,endIndex,dateElement(dateId,dateElementProperties),richLink(richLinkId,richLinkProperties),person(personId,personProperties))))))))),tabs(tabProperties(tabId,title),documentTab(body(content(paragraph(elements(startIndex,endIndex,dateElement(dateId,dateElementProperties),richLink(richLinkId,richLinkProperties),person(personId,personProperties))),table(tableRows(tableCells(content(paragraph(elements(startIndex,endIndex,dateElement(dateId,dateElementProperties),richLink(richLinkId,richLinkProperties),person(personId,personProperties)))))))))))',
        });

        const chips = extractSmartChips(res.data, args.tabId);
        return JSON.stringify({ smartChips: chips }, null, 2);
      } catch (error: any) {
        log.error(
          `Error listing smart chips for doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(`Failed to list smart chips: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
