import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../../clients.js';
import { DocumentIdParameter } from '../../../types.js';
import { getTableById } from '../structureHelpers.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateTableRowStyle',
    description:
      'Applies row-level styling to a Google Docs table, including minimum row height and optional pinned header rows.',
    parameters: DocumentIdParameter.extend({
      tableId: z.string().min(1).describe('The MCP table ID returned by listDocumentTables.'),
      rowIndices: z
        .array(z.number().int().min(0))
        .min(1)
        .describe('Zero-based row indices to style.'),
      minRowHeightPt: z.number().min(0).optional().describe('Minimum row height in points.'),
      preventOverflow: z
        .boolean()
        .optional()
        .describe('Whether row content should avoid overflowing outside the row.'),
      pinnedHeaderRowsCount: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Optional number of header rows to pin at the top of the table.'),
      tabId: z.string().optional().describe('Optional target tab ID.'),
    }).refine(
      (data) =>
        data.minRowHeightPt !== undefined ||
        data.preventOverflow !== undefined ||
        data.pinnedHeaderRowsCount !== undefined,
      {
        message: 'At least one row style option must be provided.',
      }
    ),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Updating table row style in ${args.tableId} for doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
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
        if (args.rowIndices.some((index) => index >= table.rowCount)) {
          throw new UserError(
            `One or more row indices exceed table ${args.tableId} row count ${table.rowCount}.`
          );
        }

        const requests = [];
        const styleRequest = GDocsHelpers.buildTableRowStyleRequest(
          table.startIndex,
          args.rowIndices,
          args.minRowHeightPt,
          args.preventOverflow,
          args.tabId
        );
        if (styleRequest) requests.push(styleRequest);

        if (args.pinnedHeaderRowsCount !== undefined) {
          requests.push(
            GDocsHelpers.buildPinTableHeaderRowsRequest(
              table.startIndex,
              args.pinnedHeaderRowsCount,
              args.tabId
            )
          );
        }

        if (requests.length === 0) {
          throw new UserError('No row style requests were generated.');
        }

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, requests);
        return `Successfully updated row style for ${args.tableId}.`;
      } catch (error: any) {
        log.error(
          `Error updating table row style for ${args.tableId} in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update table row style: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
