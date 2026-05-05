import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { getTableById } from './structureHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteTableRows',
    description:
      'Deletes one or more rows from an existing Google Docs table without replacing the whole document.',
    parameters: DocumentIdParameter.extend({
      tableId: z
        .string()
        .min(1)
        .describe('The MCP table ID returned by listDocumentTables, for example "table:body:0".'),
      rowStart: z.number().int().min(0).describe('Zero-based starting row index to delete.'),
      rowCount: z.number().int().min(1).describe('Number of rows to delete.'),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab containing the table. If not specified, uses the first tab or legacy document body.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Deleting ${args.rowCount} row(s) from ${args.tableId} in doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields:
            'body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(paragraph(elements(textRun(content))))))))),tabs(tabProperties(tabId,title),documentTab(body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(paragraph(elements(textRun(content)))))))))))',
        });

        const table = getTableById(res.data, args.tableId, args.tabId);
        if (!table) {
          throw new UserError(`Table "${args.tableId}" not found in document.`);
        }
        if (table.startIndex == null) {
          throw new UserError(`Table "${args.tableId}" does not expose a valid table start index.`);
        }
        if (args.rowStart + args.rowCount > table.rowCount) {
          throw new UserError(
            `Requested rows ${args.rowStart}-${args.rowStart + args.rowCount - 1} exceed table ${args.tableId} row count ${table.rowCount}.`
          );
        }

        const requests = [];
        for (
          let rowIndex = args.rowStart + args.rowCount - 1;
          rowIndex >= args.rowStart;
          rowIndex--
        ) {
          requests.push(
            GDocsHelpers.buildDeleteTableRowRequest(table.startIndex, rowIndex, args.tabId)
          );
        }

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, requests);
        return `Successfully deleted ${args.rowCount} row(s) from table ${args.tableId}.`;
      } catch (error: any) {
        log.error(
          `Error deleting rows from ${args.tableId} in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(`Failed to delete table rows: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
