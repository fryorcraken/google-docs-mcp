import type { FastMCP } from 'fastmcp';
import { register as replaceDocumentWithMarkdown } from './replaceDocumentWithMarkdown.js';
import { register as appendMarkdownToGoogleDoc } from './appendMarkdownToGoogleDoc.js';
import { register as replaceRangeWithMarkdown } from './replaceRangeWithMarkdown.js';
import { register as insertMarkdown } from './insertMarkdown.js';

export function registerUtilsTools(server: FastMCP) {
  replaceDocumentWithMarkdown(server);
  appendMarkdownToGoogleDoc(server);
  replaceRangeWithMarkdown(server);
  insertMarkdown(server);
}
