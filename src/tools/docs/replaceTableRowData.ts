import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import { getTableById } from './structureHelpers.js';
import { replaceTableRowData as replaceTableRowDataInternal } from './tableRowDataHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replaceTableRowData',
    description:
      'Replaces the plain-text contents of a single row in an existing Google Docs table while preserving the table structure and formatting.',
    parameters: DocumentIdParameter.extend({
      tableId: z
        .string()
        .min(1)
        .describe('The MCP table ID returned by listDocumentTables, for example "table:body:0".'),
      rowIndex: z.number().int().min(0).describe('Zero-based row index to replace.'),
      values: z
        .array(z.string())
        .max(50)
        .describe('Plain-text values to place into the row cells from left to right.'),
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
        `Replacing row ${args.rowIndex} in ${args.tableId} for doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields:
            'body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content))))))))),tabs(tabProperties(tabId,title),documentTab(body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content)))))))))))',
        });

        const table = getTableById(res.data, args.tableId, args.tabId);
        if (!table) {
          throw new UserError(`Table "${args.tableId}" not found in document.`);
        }

        await replaceTableRowDataInternal(
          docs,
          args.documentId,
          table,
          args.rowIndex,
          args.values,
          args.tabId
        );

        return `Successfully replaced row ${args.rowIndex} in table ${args.tableId}.`;
      } catch (error: any) {
        log.error(
          `Error replacing row ${args.rowIndex} in ${args.tableId} for doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(
          `Failed to replace table row data: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
