import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import { findHeadings } from './structureHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'findSectionsByHeading',
    description:
      'Finds heading-based sections in a Google Document and reports heading ranges plus the first table that follows each heading.',
    parameters: DocumentIdParameter.extend({
      headings: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe('List of exact heading texts to locate in the document.'),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab to inspect. If not specified, inspects the first tab or legacy document body.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Finding sections by heading in ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}: ${args.headings.join(', ')}`
      );

      try {
        // includeTabsContent: true always populates `tabs` (even for a
        // document that predates the tabs feature — it gets one synthetic
        // tab), and the API rejects a mask that combines it with the
        // top-level `body` field ("Field mask may not contain legacy
        // text-level Document resource fields while requesting tabs
        // content"). Read exclusively through tabs(...documentTab.body...);
        // getContentSource's tabs[0] fallback covers the no-tabId case.
        const contentFields =
          'content(startIndex,endIndex,paragraph(paragraphStyle(namedStyleType,headingId),elements(textRun(content))),table(tableRows(tableCells(startIndex,endIndex,content(paragraph(elements(textRun(content))))))))';
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields: `tabs(tabProperties(tabId,title),documentTab(body(${contentFields})))`,
        });

        const sections = findHeadings(res.data, args.headings, args.tabId);
        return JSON.stringify({ sections }, null, 2);
      } catch (error: any) {
        log.error(
          `Error finding sections by heading in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(
          `Failed to find sections by heading: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
