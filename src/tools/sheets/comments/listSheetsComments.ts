import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { google } from 'googleapis';
import { getAuthClient, getSheetsClient } from '../../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listSheetsComments',
    description:
      'Lists all comments in a Google Spreadsheet. Filter by sheet name, specific row(s), specific cell, or a cell range. Returns comment IDs needed for getSheetsComment, replyToSheetsComment, resolveSheetsComment, or deleteSheetsComment.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      sheetName: z
        .string()
        .optional()
        .describe('Optional: filter comments to only this sheet/tab name.'),
      row: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Optional: filter to comments on this specific row number (1-based, e.g., 5 for row 5).'
        ),
      rows: z
        .array(z.number().int().min(1))
        .optional()
        .describe(
          'Optional: filter to comments on any of these row numbers (1-based, e.g., [3, 5, 12]). Ignored if "row" is set.'
        ),
      cell: z
        .string()
        .optional()
        .describe(
          'Optional: filter to comments on this specific cell in A1 notation (e.g., "B3"). Overrides row/rows filters.'
        ),
      range: z
        .string()
        .optional()
        .describe(
          'Optional: filter to comments within this A1 range (e.g., "A1:D10", "B:B" for entire column B). Overrides row/rows/cell filters.'
        ),
      includeResolved: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, include resolved comments. Defaults to false.'),
    }),
    execute: async (args, { log }) => {
      log.info(`Listing comments for spreadsheet ${args.spreadsheetId}`);

      try {
        const authClient = await getAuthClient();
        const drive = google.drive({ version: 'v3', auth: authClient });

        const comments: any[] = [];
        let pageToken: string | undefined;

        do {
          const response = await drive.comments.list({
            fileId: args.spreadsheetId,
            fields:
              'comments(id,content,anchor,quotedFileContent,author,createdTime,modifiedTime,resolved,replies(id,content,author,createdTime)),nextPageToken',
            pageSize: 100,
            ...(pageToken ? { pageToken } : {}),
          });

          comments.push(...(response.data.comments || []));
          pageToken = response.data.nextPageToken || undefined;
        } while (pageToken);

        let sheetGidMap: Record<string, string> = {};
        const needSheetMeta = args.sheetName || args.row || args.rows || args.cell || args.range;

        if (needSheetMeta) {
          const sheetsClient = await getSheetsClient();
          const meta = await sheetsClient.spreadsheets.get({
            spreadsheetId: args.spreadsheetId,
            fields: 'sheets.properties',
          });
          for (const sheet of meta.data.sheets || []) {
            const props = sheet.properties;
            if (props?.sheetId !== undefined && props?.title) {
              sheetGidMap[String(props.sheetId)] = props.title;
            }
          }
        }

        const rangeFilter = args.range ? parseA1Range(args.range) : null;
        const cellFilter = args.cell ? a1ToRowCol(args.cell) : null;
        const rowSet = args.row
          ? new Set([args.row - 1])
          : args.rows
            ? new Set(args.rows.map((r) => r - 1))
            : null;

        const result = comments
          .filter((c) => {
            if (!args.includeResolved && c.resolved) return false;
            const cellInfo = c.anchor ? parseSheetsAnchor(c.anchor) : null;

            if (args.sheetName && cellInfo) {
              const resolvedName = sheetGidMap[String(cellInfo.sheetId)];
              if (resolvedName && resolvedName !== args.sheetName) return false;
            }

            if (!cellInfo) return !rangeFilter && !cellFilter && !rowSet;

            if (rangeFilter) {
              return (
                cellInfo.row >= rangeFilter.startRow &&
                cellInfo.row <= rangeFilter.endRow &&
                cellInfo.col >= rangeFilter.startCol &&
                cellInfo.col <= rangeFilter.endCol
              );
            }
            if (cellFilter) {
              return cellInfo.row === cellFilter.row && cellInfo.col === cellFilter.col;
            }
            if (rowSet) {
              return rowSet.has(cellInfo.row);
            }
            return true;
          })
          .map((comment: any) => {
            const cellInfo = comment.anchor ? parseSheetsAnchor(comment.anchor) : null;
            let cellRef: string | null = null;
            let sheetTitle: string | null = null;

            if (cellInfo) {
              cellRef = rowColToA1(cellInfo.row, cellInfo.col);
              if (Object.keys(sheetGidMap).length > 0) {
                sheetTitle = sheetGidMap[String(cellInfo.sheetId)] || null;
              }
            }

            return {
              id: comment.id,
              author: comment.author?.displayName || null,
              content: comment.content,
              cell: cellRef,
              sheetName: sheetTitle,
              quotedText: comment.quotedFileContent?.value || null,
              resolved: comment.resolved || false,
              createdTime: comment.createdTime,
              modifiedTime: comment.modifiedTime,
              replyCount: comment.replies?.length || 0,
            };
          });

        return JSON.stringify({ comments: result, total: result.length }, null, 2);
      } catch (error: any) {
        log.error(`Error listing sheets comments: ${error.message || error}`);
        throw new UserError(
          `Failed to list spreadsheet comments: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}

function parseSheetsAnchor(
  anchorStr: string
): { sheetId: number; row: number; col: number } | null {
  try {
    const anchor = JSON.parse(anchorStr);
    const actions = anchor.a;
    if (!actions || !Array.isArray(actions)) return null;
    for (const action of actions) {
      if (action.sht) {
        const sid = action.sht.sid;
        const rng = action.sht.rng;
        if (sid !== undefined && rng) {
          return { sheetId: sid, row: rng.r || 0, col: rng.c || 0 };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function rowColToA1(row: number, col: number): string {
  let colStr = '';
  let c = col;
  do {
    colStr = String.fromCharCode(65 + (c % 26)) + colStr;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return `${colStr}${row + 1}`;
}

function a1ToRowCol(a1: string): { row: number; col: number } {
  const match = a1.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return { row: 0, col: 0 };
  const colStr = match[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { row: parseInt(match[2], 10) - 1, col: col - 1 };
}

function parseA1Range(range: string): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  const stripped = range.includes('!') ? range.split('!')[1] : range;
  const parts = stripped.split(':');

  const colOnly = /^[A-Za-z]+$/;
  const rowOnly = /^\d+$/;

  const parseCorner = (s: string): { row: number | null; col: number | null } => {
    if (colOnly.test(s)) {
      const upper = s.toUpperCase();
      let c = 0;
      for (let i = 0; i < upper.length; i++) c = c * 26 + (upper.charCodeAt(i) - 64);
      return { row: null, col: c - 1 };
    }
    if (rowOnly.test(s)) {
      return { row: parseInt(s, 10) - 1, col: null };
    }
    const rc = a1ToRowCol(s);
    return { row: rc.row, col: rc.col };
  };

  if (parts.length === 1) {
    const p = parseCorner(parts[0]);
    return {
      startRow: p.row ?? 0,
      endRow: p.row ?? 999999,
      startCol: p.col ?? 0,
      endCol: p.col ?? 999999,
    };
  }

  const start = parseCorner(parts[0]);
  const end = parseCorner(parts[1]);
  return {
    startRow: start.row ?? 0,
    endRow: end.row ?? 999999,
    startCol: start.col ?? 0,
    endCol: end.col ?? 999999,
  };
}
