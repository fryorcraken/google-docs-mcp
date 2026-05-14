import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../../clients.js';
import { DocumentIdParameter } from '../../../types.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';

// Google Docs API bullet/numbering presets. Names mirror the Docs API
// enum BulletGlyphPreset; we only expose the common ones to keep the
// surface area small. Add more here if needed.
const BulletPresetEnum = z.enum([
  'BULLET_DISC_CIRCLE_SQUARE',
  'BULLET_DIAMONDX_ARROW3D_SQUARE',
  'BULLET_CHECKBOX',
  'BULLET_ARROW_DIAMOND_DISC',
  'BULLET_STAR_CIRCLE_SQUARE',
  'BULLET_ARROW3D_CIRCLE_SQUARE',
  'BULLET_LEFTTRIANGLE_DIAMOND_DISC',
  'BULLET_DIAMONDX_HOLLOWDIAMOND_SQUARE',
  'BULLET_DIAMOND_CIRCLE_SQUARE',
  'NUMBERED_DECIMAL_ALPHA_ROMAN',
  'NUMBERED_DECIMAL_ALPHA_ROMAN_PARENS',
  'NUMBERED_DECIMAL_NESTED',
  'NUMBERED_UPPERALPHA_ALPHA_ROMAN',
  'NUMBERED_UPPERROMAN_UPPERALPHA_DECIMAL',
  'NUMBERED_ZERODECIMAL_ALPHA_ROMAN',
]);

const TargetByRange = z.object({
  startIndex: z.number().int().min(1).describe('Start of range (inclusive, 1-based).'),
  endIndex: z.number().int().min(1).describe('End of range (exclusive).'),
});

const TargetByText = z.object({
  textToFind: z
    .string()
    .min(1)
    .describe('Exact text to locate. The paragraph containing this text will be targeted.'),
  matchInstance: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Which instance of textToFind to use (1-based, defaults to 1).'),
});

const TargetByIndex = z.object({
  indexWithinParagraph: z
    .number()
    .int()
    .min(1)
    .describe('Any index within the paragraph whose bullet should be modified.'),
});

const UpdateParagraphBulletsParameters = DocumentIdParameter.extend({
  target: z
    .union([TargetByRange, TargetByText, TargetByIndex])
    .describe(
      'Specify which paragraph(s) to update: by range, by finding text, or by an index within the paragraph.'
    ),
  action: z
    .enum(['remove', 'set'])
    .describe(
      "'remove' clears the bullet attribute from paragraphs in the range (turns list items back into plain paragraphs). 'set' applies the given bulletPreset."
    ),
  bulletPreset: BulletPresetEnum.optional().describe(
    "Required when action='set'. The bullet/numbering style preset to apply (e.g., BULLET_DISC_CIRCLE_SQUARE for filled-disc bullets, NUMBERED_DECIMAL_ALPHA_ROMAN for ordered numbering)."
  ),
  tabId: z
    .string()
    .optional()
    .describe(
      "Optional tab ID (format 't.xxxxxx'). If omitted on a tabbed document, defaults to the first tab. Use listDocumentTabs to find tab IDs."
    ),
}).refine(
  (data) => {
    if (data.action === 'set') return !!data.bulletPreset;
    return true;
  },
  { message: "bulletPreset is required when action='set'.", path: ['bulletPreset'] }
);

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateParagraphBullets',
    description:
      "Adds, changes, or removes paragraph bullets/numbering. Use action='remove' to clear bullets from headings or plain paragraphs that accidentally inherited a bullet; use action='set' with a bulletPreset to apply or change the glyph style. " +
      'Target by character range, by finding text, or by an index within the paragraph.',
    parameters: UpdateParagraphBulletsParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `updateParagraphBullets on doc ${args.documentId}: action=${args.action}` +
          `${args.bulletPreset ? `, preset=${args.bulletPreset}` : ''}` +
          `${args.tabId ? `, tab=${args.tabId}` : ''}`
      );

      try {
        const tab = await GDocsHelpers.resolveTab(docs, args.documentId, args.tabId);
        const effectiveTabId = tab.tabId;

        // Resolve target to a paragraph range. createParagraphBullets and
        // deleteParagraphBullets both operate over a Range and apply to
        // every paragraph the range touches — but to keep behavior
        // predictable for single-paragraph targets we explicitly snap
        // text/index targets to the paragraph boundary.
        let startIndex: number;
        let endIndex: number;

        if ('startIndex' in args.target) {
          startIndex = args.target.startIndex;
          endIndex = args.target.endIndex;
          if (endIndex <= startIndex) {
            throw new UserError('endIndex must be greater than startIndex');
          }
        } else if ('textToFind' in args.target) {
          const textRange = await GDocsHelpers.findTextRange(
            docs,
            args.documentId,
            args.target.textToFind,
            args.target.matchInstance ?? 1,
            effectiveTabId
          );
          if (!textRange) {
            throw new UserError(
              `Could not find "${args.target.textToFind}" (instance ${args.target.matchInstance ?? 1}) in the document${effectiveTabId ? ` (tab: ${effectiveTabId})` : ''}.`
            );
          }
          const paragraphRange = await GDocsHelpers.getParagraphRange(
            docs,
            args.documentId,
            textRange.startIndex,
            effectiveTabId
          );
          if (!paragraphRange) {
            throw new UserError(
              `Found "${args.target.textToFind}" but could not locate its paragraph boundaries.`
            );
          }
          startIndex = paragraphRange.startIndex;
          endIndex = paragraphRange.endIndex;
        } else {
          // indexWithinParagraph
          const paragraphRange = await GDocsHelpers.getParagraphRange(
            docs,
            args.documentId,
            args.target.indexWithinParagraph,
            effectiveTabId
          );
          if (!paragraphRange) {
            throw new UserError(
              `Could not find a paragraph containing index ${args.target.indexWithinParagraph}.`
            );
          }
          startIndex = paragraphRange.startIndex;
          endIndex = paragraphRange.endIndex;
        }

        const range: docs_v1.Schema$Range = { startIndex, endIndex };
        if (effectiveTabId) range.tabId = effectiveTabId;

        const request: docs_v1.Schema$Request =
          args.action === 'remove'
            ? { deleteParagraphBullets: { range } }
            : { createParagraphBullets: { range, bulletPreset: args.bulletPreset! } };

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);

        const verb =
          args.action === 'remove' ? 'Removed bullets from' : `Applied ${args.bulletPreset} to`;
        return `${verb} paragraph(s) in range ${startIndex}-${endIndex}${effectiveTabId ? ` in tab ${effectiveTabId}` : ''}.`;
      } catch (error: any) {
        log.error(
          `Error in updateParagraphBullets for doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to update paragraph bullets: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
