import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../../clients.js';
import { DocumentIdParameter, OptionalTabIdParameter } from '../../../types.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';

const TargetByText = z.object({
  textToFind: z.string().min(1).describe('Exact text in the target paragraph.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Which instance of textToFind (1-based, defaults to 1).'),
});

const TargetByIndex = z.object({
  indexWithinParagraph: z.number().int().min(1).describe('Any index inside the target paragraph.'),
});

// Subset of named style types worth defaulting to in an unbullet operation —
// matches the Docs API enum NamedStyleType but skipping TITLE/SUBTITLE which
// are rarely the right answer for "this paragraph isn't a bullet anymore".
const NamedStyleTypeEnum = z.enum([
  'NORMAL_TEXT',
  'HEADING_1',
  'HEADING_2',
  'HEADING_3',
  'HEADING_4',
  'HEADING_5',
  'HEADING_6',
]);

const UnbulletParagraphParameters = DocumentIdParameter.extend({
  target: z.union([TargetByText, TargetByIndex]).describe('Which paragraph to unbullet.'),
  stripPrefix: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional leading text (e.g. "Details: ") to remove from the start of the paragraph before unbullet. Must match exactly; if it does not, the call throws.'
    ),
  namedStyleType: NamedStyleTypeEnum.optional().describe(
    "Paragraph style to apply after removing the bullet. Defaults to 'NORMAL_TEXT' — set this when the paragraph inherited a heading style from the bullet's parent that you don't want to keep."
  ),
  clearInlineStyles: z
    .boolean()
    .optional()
    .describe(
      'When true (default), clears inherited inline styles (bold, italic, underline, strikethrough, link) over the paragraph range. Set false to preserve them.'
    ),
}).merge(OptionalTabIdParameter);

export function register(server: FastMCP) {
  server.addTool({
    name: 'unbulletParagraph',
    description:
      'Single-call wrapper that takes a bulleted paragraph and turns it back into a plain paragraph: optionally strips a leading prefix from the text, removes the bullet attribute, forces a namedStyleType (default NORMAL_TEXT), and clears inherited inline styles (bold/italic/underline/strikethrough/link). ' +
      'Replaces a 3–4 call sequence (deleteRange + updateParagraphBullets + applyTextStyle + applyParagraphStyle) where each step can fail in subtle ways individually. Paragraph is re-resolved from current document state after the prefix-strip, so index arithmetic across the steps is handled internally.',
    parameters: UnbulletParagraphParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);
      const effectiveTabId = tab.tabId;

      log.info(
        `unbulletParagraph on doc ${args.documentId}${effectiveTabId ? ` (tab: ${effectiveTabId})` : ''}`
      );

      const clearInline = args.clearInlineStyles ?? true;
      const targetNamedStyle = args.namedStyleType ?? 'NORMAL_TEXT';

      // Resolve the initial paragraph range from the target.
      let indexWithin: number;
      if ('textToFind' in args.target) {
        const textRange = await GDocsHelpers.findTextRange(
          docs,
          args.documentId,
          args.target.textToFind,
          args.target.matchInstance ?? 1,
          effectiveTabId
        );
        if (!textRange) {
          throw new UserError(
            `Could not find "${args.target.textToFind}" (instance ${args.target.matchInstance ?? 1})${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}.`
          );
        }
        indexWithin = textRange.startIndex;
      } else {
        indexWithin = args.target.indexWithinParagraph;
      }

      let paragraphRange = await GDocsHelpers.getParagraphRange(
        docs,
        args.documentId,
        indexWithin,
        effectiveTabId
      );
      if (!paragraphRange) {
        throw new UserError(`Could not determine paragraph boundaries.`);
      }

      // Step 1 (optional): strip leading prefix. We do this in its own
      // batchUpdate so the subsequent style ops see fresh paragraph indices —
      // mixing a deleteContentRange and same-paragraph style updates in one
      // batch requires manual index adjustment that is easy to get wrong.
      if (args.stripPrefix) {
        const prefixStart = paragraphRange.startIndex;
        const prefixEnd = prefixStart + args.stripPrefix.length;
        if (prefixEnd > paragraphRange.endIndex - 1) {
          // -1 accounts for the trailing newline that must remain.
          throw new UserError(
            `stripPrefix "${args.stripPrefix}" is longer than the paragraph's content; refusing to strip.`
          );
        }

        // Verify the prefix actually matches the paragraph's leading text.
        // We use findTextRange against the full prefix string and check it
        // anchors at paragraph start — cheaper than fetching the paragraph
        // content again.
        const found = await GDocsHelpers.findTextRange(
          docs,
          args.documentId,
          args.stripPrefix,
          1,
          effectiveTabId
        );
        if (!found || found.startIndex !== prefixStart) {
          throw new UserError(
            `stripPrefix "${args.stripPrefix}" does not match the start of the target paragraph at index ${prefixStart}.`
          );
        }

        const range: docs_v1.Schema$Range = { startIndex: prefixStart, endIndex: prefixEnd };
        if (effectiveTabId) range.tabId = effectiveTabId;
        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [
          { deleteContentRange: { range } },
        ]);

        // Re-resolve the paragraph; its endIndex shrank by the prefix length.
        paragraphRange = await GDocsHelpers.getParagraphRange(
          docs,
          args.documentId,
          prefixStart,
          effectiveTabId
        );
        if (!paragraphRange) {
          throw new UserError(`Lost track of paragraph after stripping prefix.`);
        }
      }

      // Step 2: bundle remaining ops in a single batchUpdate. All operate
      // on the same (post-strip) paragraph range — no index drift between
      // them since none changes the document length.
      const range: docs_v1.Schema$Range = {
        startIndex: paragraphRange.startIndex,
        endIndex: paragraphRange.endIndex,
      };
      if (effectiveTabId) range.tabId = effectiveTabId;

      const requests: docs_v1.Schema$Request[] = [
        { deleteParagraphBullets: { range } },
        {
          updateParagraphStyle: {
            range,
            paragraphStyle: { namedStyleType: targetNamedStyle },
            fields: 'namedStyleType',
          },
        },
      ];

      if (clearInline) {
        requests.push({
          updateTextStyle: {
            range,
            textStyle: {
              bold: false,
              italic: false,
              underline: false,
              strikethrough: false,
              link: {},
            },
            fields: 'bold,italic,underline,strikethrough,link',
          },
        });
      }

      await GDocsHelpers.executeBatchUpdate(docs, args.documentId, requests);

      const parts = [
        args.stripPrefix ? `stripped prefix "${args.stripPrefix}"` : null,
        'removed bullet',
        `set ${targetNamedStyle}`,
        clearInline ? 'cleared inline styles' : null,
      ].filter(Boolean);
      return `unbulletParagraph at ${paragraphRange.startIndex}-${paragraphRange.endIndex}${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}: ${parts.join(', ')}.`;
    },
  });
}
