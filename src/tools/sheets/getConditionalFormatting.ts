import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

function colIndexToLetters(index: number): string {
  let s = '';
  let i = index;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

function rgbToHex(rgb: { red?: number; green?: number; blue?: number } | null | undefined): string {
  if (!rgb) return '#000000';
  const r = Math.round((rgb.red ?? 0) * 255);
  const g = Math.round((rgb.green ?? 0) * 255);
  const b = Math.round((rgb.blue ?? 0) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'getConditionalFormatting',
    description:
      'Lists all conditional formatting rules for a sheet as JSON. Each rule includes its index (needed for deleteConditionalFormatting), kind (BOOLEAN or GRADIENT), ranges, condition type/values, and applied formats (colors, bold, italic).',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      sheetName: z
        .string()
        .optional()
        .describe('Name of the sheet/tab. Defaults to the first sheet if not provided.'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Getting conditional formatting rules for spreadsheet ${args.spreadsheetId}`);

      try {
        const sheetId = await SheetsHelpers.resolveSheetId(
          sheets,
          args.spreadsheetId,
          args.sheetName
        );

        const response = await sheets.spreadsheets.get({
          spreadsheetId: args.spreadsheetId,
          fields: 'sheets(properties(sheetId,title),conditionalFormats)',
        });

        const sheet = response.data.sheets?.find((s) => s.properties?.sheetId === sheetId);
        const rules = sheet?.conditionalFormats ?? [];

        const sheetTitle = sheet?.properties?.title ?? null;

        const ruleSummaries = rules.map((rule, idx) => {
          const condition = rule.booleanRule?.condition;
          const gradient = rule.gradientRule;
          const fmt = rule.booleanRule?.format ?? {};

          const ranges = (rule.ranges ?? []).map((r) => {
            const startCol =
              r.startColumnIndex != null ? colIndexToLetters(r.startColumnIndex) : '';
            const endCol = r.endColumnIndex != null ? colIndexToLetters(r.endColumnIndex - 1) : '';
            const startRow = r.startRowIndex != null ? r.startRowIndex + 1 : '';
            const endRow = r.endRowIndex != null ? r.endRowIndex : '';
            return `${startCol}${startRow}:${endCol}${endRow}`;
          });

          const kind = gradient ? 'GRADIENT' : 'BOOLEAN';
          const conditionType = condition?.type ?? (gradient ? 'GRADIENT' : null);
          const conditionValues = (condition?.values ?? [])
            .map((v) => v.userEnteredValue)
            .filter((v): v is string => typeof v === 'string');

          const bg = fmt.backgroundColor;
          const backgroundColor = bg
            ? rgbToHex({ red: bg.red ?? 0, green: bg.green ?? 0, blue: bg.blue ?? 0 })
            : null;
          const fg = fmt.textFormat?.foregroundColor;
          const textColor = fg
            ? rgbToHex({ red: fg.red ?? 0, green: fg.green ?? 0, blue: fg.blue ?? 0 })
            : null;

          return {
            index: idx,
            kind,
            ranges,
            conditionType,
            conditionValues,
            backgroundColor,
            textColor,
            bold: fmt.textFormat?.bold ?? false,
            italic: fmt.textFormat?.italic ?? false,
          };
        });

        return JSON.stringify(
          {
            spreadsheetId: args.spreadsheetId,
            sheetName: sheetTitle,
            count: ruleSummaries.length,
            rules: ruleSummaries,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error getting conditional formatting: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to get conditional formatting: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
