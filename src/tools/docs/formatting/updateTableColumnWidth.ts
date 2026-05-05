import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../../clients.js';
import { DocumentIdParameter } from '../../../types.js';
import { getTableById } from '../structureHelpers.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateTableColumnWidth',
    description: 'Sets fixed widths for one or more columns in an existing Google Docs table.',
    parameters: DocumentIdParameter.extend({
      tableId: z.string().min(1).describe('The MCP table ID returned by listDocumentTables.'),
      columnIndices: z
        .array(z.number().int().min(0))
        .min(1)
        .describe('Zero-based column indices to update.'),
      widthPt: z.number().min(1).describe('Fixed width in points.'),
      tabId: z.string().optional().describe('Optional target tab ID.'),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Updating table column widths in ${args.tableId} for doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields:
            'body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex))))),tabs(tabProperties(tabId,title),documentTab(body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex)))))))',
        });

        const table = getTableById(res.data, args.tableId, args.tabId);
        if (!table) throw new UserError(`Table "${args.tableId}" not found in document.`);
        if (table.startIndex == null) {
          throw new UserError(`Table "${args.tableId}" does not expose a valid table start index.`);
        }
        if (args.columnIndices.some((index) => index >= table.columnCount)) {
          throw new UserError(
            `One or more column indices exceed table ${args.tableId} column count ${table.columnCount}.`
          );
        }

        const request = GDocsHelpers.buildTableColumnWidthRequest(
          table.startIndex,
          args.columnIndices,
          args.widthPt,
          args.tabId
        );

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);
        return `Successfully updated width for ${args.columnIndices.length} column(s) in ${args.tableId}.`;
      } catch (error: any) {
        log.error(
          `Error updating column widths for ${args.tableId} in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update table column width: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
