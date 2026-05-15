import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, MarkdownConversionError } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { insertMarkdown, formatInsertResult } from '../../markdown-transformer/index.js';

const TargetByIndex = z.object({
  index: z
    .number()
    .int()
    .min(1)
    .describe(
      "The 1-based character index to insert at. Use readDocument with format='json' to find indices."
    ),
});

const TargetByText = z.object({
  textToFind: z
    .string()
    .min(1)
    .describe('Exact text to anchor against. The markdown is inserted relative to this text.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Which instance of textToFind to anchor against (1-based, defaults to 1).'),
  position: z
    .enum(['before', 'after'])
    .describe(
      "'before' inserts the markdown immediately before the matched text (in the same paragraph). " +
        "'after' inserts immediately after the matched text. " +
        'For inserting a new paragraph between two paragraphs, target the anchor text at the start of the second paragraph and use position=before.'
    ),
});

const InsertMarkdownParameters = DocumentIdParameter.extend({
  markdown: z
    .string()
    .min(1)
    .max(500000)
    .describe('Markdown content to insert. Supports headings, bold/italic, links, lists, tables.'),
  target: z
    .union([TargetByIndex, TargetByText])
    .describe(
      'Where to insert: by character index, or anchored to text with before/after position. ' +
        "Use readDocument with format='json' to discover indices."
    ),
  tabId: z
    .string()
    .optional()
    .describe(
      "Optional tab ID (format 't.xxxxxx'). If omitted on a tabbed document, defaults to the first tab."
    ),
  firstHeadingAsTitle: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If true, the first H1 in the markdown is styled as a Google Docs TITLE instead of Heading 1. Defaults to false.'
    ),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertMarkdown',
    description:
      'Inserts markdown-formatted content at a chosen position in a document. ' +
      'Target by character index, or anchor to existing text with position before/after. ' +
      'Supports headings, bold/italic/strikethrough, links, bullet/numbered lists, code blocks, and tables. ' +
      'Paragraph-level styling in the markdown (`### heading`, `- bullet`, etc.) overrides ' +
      'the paragraph style of the target position — bullets stay bullets even when inserting ' +
      'into a heading paragraph. ' +
      'This is the tool to reach for when you need to insert a new section (with its own heading and styling) in the middle of an existing document — neither appendMarkdown (end-only) nor findAndReplace (text-only) covers that case.',
    parameters: InsertMarkdownParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);
      const effectiveTabId = tab.tabId;

      let insertionIndex: number;
      if ('index' in args.target) {
        insertionIndex = args.target.index;
      } else {
        const found = await GDocsHelpers.findTextRange(
          docs,
          args.documentId,
          args.target.textToFind,
          args.target.matchInstance ?? 1,
          effectiveTabId
        );
        if (!found) {
          throw new UserError(
            `Could not find text "${args.target.textToFind}" (instance ${args.target.matchInstance ?? 1})${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}.`
          );
        }
        insertionIndex = args.target.position === 'before' ? found.startIndex : found.endIndex;
      }

      log.info(
        `Inserting markdown at index ${insertionIndex} in doc ${args.documentId} (${args.markdown.length} chars)${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}`
      );

      try {
        const result = await insertMarkdown(docs, args.documentId, args.markdown, {
          startIndex: insertionIndex,
          tabId: effectiveTabId ?? undefined,
          firstHeadingAsTitle: args.firstHeadingAsTitle,
        });

        const debugSummary = formatInsertResult(result);
        log.info(debugSummary);
        return `Successfully inserted ${args.markdown.length} characters of markdown at index ${insertionIndex}.\n\n${debugSummary}`;
      } catch (error: any) {
        log.error(`Error inserting markdown: ${error.message}`);
        if (error instanceof UserError || error instanceof MarkdownConversionError) {
          throw error;
        }
        throw new UserError(`Failed to insert markdown: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
