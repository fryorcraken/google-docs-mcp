// src/tools/index.ts
import type { FastMCP } from 'fastmcp';
import { registerDocsTools } from './docs/index.js';
import { registerDriveTools } from './drive/index.js';
import { registerSheetsTools } from './sheets/index.js';
import { registerUtilsTools } from './utils/index.js';
import { registerGmailTools } from './gmail/index.js';
import { registerCalendarTools } from './calendar/index.js';

/**
 * Registers all tools with the FastMCP server.
 */
export function registerAllTools(server: FastMCP) {
  registerDocsTools(server);
  registerDriveTools(server);
  registerSheetsTools(server);
  registerUtilsTools(server);
  registerGmailTools(server);
  registerCalendarTools(server);
}
