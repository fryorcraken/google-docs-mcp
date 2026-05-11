import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, MarkdownConversionError } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { insertMarkdown, formatInsertResult } from '../../markdown-transformer/index.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replaceRangeWithMarkdown',
    description:
      'Replaces a character range with markdown-formatted content. ' +
      "Target by {startIndex, endIndex} (from readDocument with format='json') " +
      'or by {textToFind, matchInstance} for text-based targeting. ' +
      'Supports headings, bold/italic/strikethrough, links, lists, code blocks, and tables. ' +
      'Paragraph properties at startIndex are inherited by inserted content.',
    parameters: DocumentIdParameter.extend({
      markdown: z
        .string()
        .min(1)
        .max(500000)
        .describe('The markdown content to insert in place of the deleted range.'),
      // Two ways to specify the range — exclusive union, validated below.
      startIndex: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Start index of the range (inclusive, 1-based). Pair with endIndex.'),
      endIndex: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('End index of the range (exclusive, 1-based). Pair with startIndex.'),
      textToFind: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Exact text to locate and replace. Alternative to startIndex/endIndex. Pair with matchInstance.'
        ),
      matchInstance: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Which instance of textToFind to replace (1-based, defaults to 1).'),
      tabId: z
        .string()
        .optional()
        .describe(
          "Optional tab ID (format 't.xxxxxx'). If omitted on a tabbed document, defaults to the first tab. " +
            'Use listDocumentTabs to find tab IDs.'
        ),
      firstHeadingAsTitle: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, the first H1 in the markdown is styled as a Google Docs TITLE instead of Heading 1. Defaults to false — range-scoped edits rarely contain a document title.'
        ),
    }).refine(
      (data) => {
        const hasRange = data.startIndex !== undefined && data.endIndex !== undefined;
        const hasText = data.textToFind !== undefined;
        return hasRange !== hasText; // XOR: exactly one targeting mode
      },
      {
        message:
          'Provide exactly one targeting mode: either {startIndex, endIndex} or {textToFind, matchInstance?}',
        path: ['startIndex'],
      }
    ),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      // Auto-detect tabbed docs: tools that take an explicit tabId param
      // must also handle the case where the caller doesn't know the doc
      // is tabbed. resolveTab does one extra GET on first call.
      const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);

      let startIndex: number;
      let endIndex: number;

      if (args.startIndex !== undefined && args.endIndex !== undefined) {
        if (args.endIndex <= args.startIndex) {
          throw new UserError('endIndex must be greater than startIndex');
        }
        startIndex = args.startIndex;
        endIndex = args.endIndex;
      } else {
        const found = await GDocsHelpers.findTextRange(
          docs,
          args.documentId,
          args.textToFind!,
          args.matchInstance ?? 1,
          tab.tabId ?? undefined
        );
        if (!found) {
          throw new UserError(
            `Could not find text "${args.textToFind}" (instance ${args.matchInstance ?? 1}) in document.`
          );
        }
        startIndex = found.startIndex;
        endIndex = found.endIndex;
      }

      log.info(
        `Replacing range ${startIndex}-${endIndex} in doc ${args.documentId} with markdown (${args.markdown.length} chars)${tab.tabId ? ` in tab ${tab.tabId}` : ''}`
      );

      try {
        // 1. Delete the existing content in the specified range.
        //    Mid-document deletion does not leave the "untouchable
        //    trailing paragraph" survivor that full-document delete
        //    does, so no survivor cleanup is needed here.
        const deleteRange: docs_v1.Schema$Range = { startIndex, endIndex };
        if (tab.tabId) deleteRange.tabId = tab.tabId;

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [
          { deleteContentRange: { range: deleteRange } },
        ]);
        log.info(`Deleted range ${startIndex}-${endIndex}.`);

        // 2. Insert markdown at startIndex — after deletion the trailing
        //    content has collapsed leftward, so this index is the same
        //    insertion point in the post-delete coordinate space.
        const result = await insertMarkdown(docs, args.documentId, args.markdown, {
          startIndex,
          tabId: tab.tabId ?? undefined,
          firstHeadingAsTitle: args.firstHeadingAsTitle,
        });

        const debugSummary = formatInsertResult(result);
        log.info(debugSummary);
        return `Successfully replaced range ${startIndex}-${endIndex} with ${args.markdown.length} characters of markdown.\n\n${debugSummary}`;
      } catch (error: any) {
        log.error(`Error replacing range with markdown: ${error.message}`);
        if (error instanceof UserError || error instanceof MarkdownConversionError) {
          throw error;
        }
        throw new UserError(
          `Failed to replace range with markdown: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
