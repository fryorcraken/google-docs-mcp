import { docs_v1 } from 'googleapis';
import { UserError } from 'fastmcp';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

/**
 * Resolves the body content of a document, routing through tabs when present.
 *
 * - With explicit `tabId`: returns that tab's body content. Throws
 *   {@link UserError} if the tab doesn't exist (so callers don't silently
 *   get "no results" from a typo'd tabId).
 * - Without `tabId`: prefers legacy `doc.body.content`; if absent, falls
 *   back to the first tab's body. This lets callers work with both legacy
 *   and tabbed documents without knowing the structure upfront.
 *
 * Tabs that exist but have no `documentTab` (e.g., non-document tab types)
 * return `[]` rather than throwing — they're valid tabs, just empty for
 * structural-content extraction purposes.
 *
 * Shared by structureHelpers and smartChipHelpers; lift here when adding
 * new structural-extraction helpers so the throw-on-bad-tabId behavior
 * stays consistent across all read tools.
 */
export function getContentSource(
  doc: docs_v1.Schema$Document,
  tabId?: string
): docs_v1.Schema$StructuralElement[] {
  if (tabId) {
    const targetTab = GDocsHelpers.findTabById(doc, tabId);
    if (!targetTab) {
      throw new UserError(
        `Tab "${tabId}" not found in document. Use listTabs to see available tab IDs.`
      );
    }
    if (!targetTab.documentTab?.body?.content) {
      return [];
    }
    return targetTab.documentTab.body.content;
  }

  if (doc.body?.content) {
    return doc.body.content;
  }

  if (doc.tabs?.[0]?.documentTab?.body?.content) {
    return doc.tabs[0].documentTab.body.content;
  }

  return [];
}
