import type { FastMCP } from 'fastmcp';

import { register as applyTextStyle } from './applyTextStyle.js';
import { register as applyParagraphStyle } from './applyParagraphStyle.js';
import { register as updateTableCellStyle } from './updateTableCellStyle.js';
import { register as updateTableBorders } from './updateTableBorders.js';
import { register as updateTableColumnWidth } from './updateTableColumnWidth.js';
import { register as updateTableRowStyle } from './updateTableRowStyle.js';

export function registerFormattingTools(server: FastMCP) {
  applyTextStyle(server);
  applyParagraphStyle(server);
  updateTableCellStyle(server);
  updateTableBorders(server);
  updateTableColumnWidth(server);
  updateTableRowStyle(server);
}
