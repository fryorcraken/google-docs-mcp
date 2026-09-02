import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, OptionalTabIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { listAllHeadings } from './structureHelpers.js';

const HEADING_CONTENT_FIELDS =
  'content(startIndex,endIndex,paragraph(paragraphStyle(namedStyleType,headingId),elements(textRun(content))))';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listHeadings',
    description:
      'Lists every heading in a document tab, in document order, with its text, level, and headingId. ' +
      "Use the returned headingId with applyTextStyle's or modifyText's style.linkHeading to create a real " +
      "internal link (Google Docs' native heading anchor) — unlike a plain URL link, this stays correct if " +
      'the heading text is later edited.',
    parameters: DocumentIdParameter.merge(OptionalTabIdParameter),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Listing headings in ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        // `includeTabsContent: true` always populates `tabs` (even for a
        // document that predates the tabs feature — it gets one synthetic
        // tab), and the API rejects a mask that combines it with the
        // top-level `body` field ("Field mask may not contain legacy
        // text-level Document resource fields while requesting tabs
        // content"). Read exclusively through tabs(...documentTab.body...);
        // getContentSource's tabs[0] fallback covers the no-tabId case.
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields: `tabs(${GDocsHelpers.TAB_RESOLUTION_FIELDS_INNER},documentTab(body(${HEADING_CONTENT_FIELDS})))`,
        });

        const tab = GDocsHelpers.resolveTabFromDocument(res.data, args.documentId, args.tabId);
        const headings = listAllHeadings(res.data, tab.tabId);

        return JSON.stringify({ tabId: tab.tabId ?? null, headings }, null, 2);
      } catch (error: any) {
        log.error(`Error listing headings in doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(`Failed to list headings: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
