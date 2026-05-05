import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../../clients.js';
import { getTableById } from '../structureHelpers.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';
import { DocumentIdParameter, validateHexColor, hexToRgbColor } from '../../../types.js';

const HexColor = z
  .string()
  .refine(validateHexColor, { message: 'Invalid hex color format (e.g., #D9E2F3).' });

const Alignment = z.enum(['TOP', 'MIDDLE', 'BOTTOM']);

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateTableCellStyle',
    description:
      'Applies cell-level formatting to a Google Docs table range, including background color, alignment, padding, and borders.',
    parameters: DocumentIdParameter.extend({
      tableId: z.string().min(1).describe('The MCP table ID returned by listDocumentTables.'),
      rowStart: z.number().int().min(0).describe('Zero-based starting row index.'),
      rowEnd: z.number().int().min(0).describe('Zero-based ending row index (inclusive).'),
      columnStart: z.number().int().min(0).describe('Zero-based starting column index.'),
      columnEnd: z.number().int().min(0).describe('Zero-based ending column index (inclusive).'),
      backgroundColor: HexColor.optional().describe('Cell background color, e.g. "#D9E2F3".'),
      contentAlignment: Alignment.optional().describe('Vertical content alignment inside cells.'),
      paddingTopPt: z.number().min(0).optional().describe('Top padding in points.'),
      paddingBottomPt: z.number().min(0).optional().describe('Bottom padding in points.'),
      paddingLeftPt: z.number().min(0).optional().describe('Left padding in points.'),
      paddingRightPt: z.number().min(0).optional().describe('Right padding in points.'),
      tabId: z.string().optional().describe('Optional target tab ID.'),
    })
      .refine((data) => data.rowEnd >= data.rowStart, {
        message: 'rowEnd must be greater than or equal to rowStart',
        path: ['rowEnd'],
      })
      .refine((data) => data.columnEnd >= data.columnStart, {
        message: 'columnEnd must be greater than or equal to columnStart',
        path: ['columnEnd'],
      }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Updating table cell style in ${args.tableId} for doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
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
        if (args.rowEnd >= table.rowCount) {
          throw new UserError(`rowEnd ${args.rowEnd} exceeds table row count ${table.rowCount}.`);
        }
        if (args.columnEnd >= table.columnCount) {
          throw new UserError(
            `columnEnd ${args.columnEnd} exceeds table column count ${table.columnCount}.`
          );
        }

        const requestInfo = GDocsHelpers.buildTableCellStyleRequest(
          table.startIndex,
          args.rowStart,
          args.columnStart,
          {
            rowSpan: args.rowEnd - args.rowStart + 1,
            columnSpan: args.columnEnd - args.columnStart + 1,
            backgroundColor: args.backgroundColor
              ? (hexToRgbColor(args.backgroundColor) ?? undefined)
              : undefined,
            contentAlignment: args.contentAlignment,
            paddingTopPt: args.paddingTopPt,
            paddingBottomPt: args.paddingBottomPt,
            paddingLeftPt: args.paddingLeftPt,
            paddingRightPt: args.paddingRightPt,
          },
          args.tabId
        );

        if (!requestInfo) {
          throw new UserError('No table cell style options were provided.');
        }

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);
        return `Successfully updated table cell style (${requestInfo.fields.join(', ')}) for ${args.tableId}.`;
      } catch (error: any) {
        log.error(
          `Error updating table cell style for ${args.tableId} in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update table cell style: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
