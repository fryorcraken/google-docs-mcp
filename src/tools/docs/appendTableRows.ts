import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { DocumentIdParameter } from '../../types.js';
import { getTableById } from './structureHelpers.js';
import { replaceTableRowData as replaceTableRowDataInternal } from './tableRowDataHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'appendTableRows',
    description:
      'Appends one or more plain-text rows to the end of an existing Google Docs table while preserving the table structure.',
    parameters: DocumentIdParameter.extend({
      tableId: z
        .string()
        .min(1)
        .describe('The MCP table ID returned by listDocumentTables, for example "table:body:0".'),
      rows: z
        .array(z.array(z.string()).max(50))
        .min(1)
        .max(200)
        .describe('Rows to append. Each inner array is the plain-text cell values for one row.'),
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
        `Appending ${args.rows.length} row(s) to ${args.tableId} in doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
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
        if (table.startIndex == null) {
          throw new UserError(`Table "${args.tableId}" does not expose a valid table start index.`);
        }

        for (const [offset, rowValues] of args.rows.entries()) {
          if (rowValues.length > table.columnCount) {
            throw new UserError(
              `Row ${offset} has ${rowValues.length} values, but table ${args.tableId} only has ${table.columnCount} columns.`
            );
          }
        }

        const insertRequests = args.rows.map(() =>
          GDocsHelpers.buildInsertTableRowRequest(
            table.startIndex!,
            table.rowCount - 1,
            true,
            args.tabId
          )
        );
        await GDocsHelpers.executeBatchUpdateWithSplitting(
          docs,
          args.documentId,
          insertRequests,
          log
        );

        const refreshed = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields:
            'body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content))))))))),tabs(tabProperties(tabId,title),documentTab(body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content)))))))))))',
        });

        const updatedTable = getTableById(refreshed.data, args.tableId, args.tabId);
        if (!updatedTable) {
          throw new UserError(`Table "${args.tableId}" could not be found after appending rows.`);
        }

        const firstAppendedRowIndex = table.rowCount;
        for (const [offset, rowValues] of args.rows.entries()) {
          const currentTable =
            offset === 0
              ? updatedTable
              : getTableById(
                  (
                    await docs.documents.get({
                      documentId: args.documentId,
                      includeTabsContent: true,
                      fields:
                        'body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content))))))))),tabs(tabProperties(tabId,title),documentTab(body(content(startIndex,endIndex,table(tableRows(tableCells(startIndex,endIndex,content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content)))))))))))',
                    })
                  ).data,
                  args.tableId,
                  args.tabId
                );
          if (!currentTable) {
            throw new UserError(
              `Table "${args.tableId}" could not be re-fetched while populating appended rows.`
            );
          }
          await replaceTableRowDataInternal(
            docs,
            args.documentId,
            currentTable,
            firstAppendedRowIndex + offset,
            rowValues,
            args.tabId
          );
        }

        return `Successfully appended ${args.rows.length} row(s) to table ${args.tableId}.`;
      } catch (error: any) {
        log.error(
          `Error appending rows to ${args.tableId} in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(`Failed to append table rows: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
