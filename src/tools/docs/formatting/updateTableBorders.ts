import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../../clients.js';
import { DocumentIdParameter, validateHexColor, hexToRgbColor } from '../../../types.js';
import { getTableById } from '../structureHelpers.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';

const BorderSideSchema = z.object({
  color: z
    .string()
    .refine(validateHexColor, { message: 'Invalid hex color format (e.g., #000000).' })
    .optional(),
  widthPt: z.number().min(0).optional(),
  dashStyle: z.enum(['SOLID', 'DASHED', 'DOTTED']).optional(),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateTableBorders',
    description:
      'Applies table border styles to a Google Docs table range. Supports top/bottom/left/right borders across a cell range.',
    parameters: DocumentIdParameter.extend({
      tableId: z.string().min(1).describe('The MCP table ID returned by listDocumentTables.'),
      rowStart: z.number().int().min(0).describe('Zero-based starting row index.'),
      rowEnd: z.number().int().min(0).describe('Zero-based ending row index (inclusive).'),
      columnStart: z.number().int().min(0).describe('Zero-based starting column index.'),
      columnEnd: z.number().int().min(0).describe('Zero-based ending column index (inclusive).'),
      top: BorderSideSchema.optional(),
      bottom: BorderSideSchema.optional(),
      left: BorderSideSchema.optional(),
      right: BorderSideSchema.optional(),
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
        `Updating table borders in ${args.tableId} for doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
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

        const defaultColor = hexToRgbColor('#000000')!;
        const makeBorder = (side?: {
          color?: string;
          widthPt?: number;
          dashStyle?: 'SOLID' | 'DASHED' | 'DOTTED';
        }) =>
          side
            ? GDocsHelpers.buildTableBorder(
                hexToRgbColor(side.color ?? '#000000') ?? defaultColor,
                side.widthPt ?? 1,
                side.dashStyle ?? 'SOLID'
              )
            : undefined;

        const requestInfo = GDocsHelpers.buildTableCellStyleRequest(
          table.startIndex,
          args.rowStart,
          args.columnStart,
          {
            rowSpan: args.rowEnd - args.rowStart + 1,
            columnSpan: args.columnEnd - args.columnStart + 1,
            borderTop: makeBorder(args.top),
            borderBottom: makeBorder(args.bottom),
            borderLeft: makeBorder(args.left),
            borderRight: makeBorder(args.right),
          },
          args.tabId
        );

        if (!requestInfo) {
          throw new UserError('No border style options were provided.');
        }

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);
        return `Successfully updated table borders (${requestInfo.fields.join(', ')}) for ${args.tableId}.`;
      } catch (error: any) {
        log.error(
          `Error updating table borders for ${args.tableId} in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to update table borders: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
