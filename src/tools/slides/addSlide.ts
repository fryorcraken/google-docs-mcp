import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { slides_v1 } from 'googleapis';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

const PREDEFINED_LAYOUTS = [
  'BLANK',
  'CAPTION_ONLY',
  'TITLE',
  'TITLE_AND_BODY',
  'TITLE_AND_TWO_COLUMNS',
  'TITLE_ONLY',
  'SECTION_HEADER',
  'SECTION_TITLE_AND_DESCRIPTION',
  'ONE_COLUMN_TEXT',
  'MAIN_POINT',
  'BIG_NUMBER',
] as const;

export function register(server: FastMCP) {
  server.addTool({
    name: 'addSlide',
    description:
      'Inserts a new slide into a Google Slides presentation. Returns the new slide objectId AND any placeholder shapes the layout produced (with their objectId, placeholderType, and any inherited prompt text). On custom themes, predefined layouts often produce zero placeholders — when `placeholders` comes back empty, use `createSlideShape` to add a TEXT_BOX manually. Use one of the predefined layouts (TITLE_AND_BODY is the common default) or BLANK for an empty slide.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      insertionIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('0-based slide index to insert at. If omitted, appends at the end.'),
      predefinedLayout: z
        .enum(PREDEFINED_LAYOUTS)
        .optional()
        .default('TITLE_AND_BODY')
        .describe('Slide layout. TITLE_AND_BODY is the default; BLANK for an empty slide.'),
      slideObjectId: z
        .string()
        .min(5)
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, {
          message: 'slideObjectId must match [a-zA-Z0-9_-]+ (Slides API requirement).',
        })
        .optional()
        .describe(
          'Optional explicit objectId for the new slide. Auto-generated if omitted. Must be 5–50 chars, [a-zA-Z0-9_-].'
        ),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Adding slide to ${args.presentationId} (layout: ${args.predefinedLayout}, index: ${args.insertionIndex ?? 'end'})`
      );
      const request: slides_v1.Schema$Request = {
        createSlide: {
          objectId: args.slideObjectId,
          insertionIndex: args.insertionIndex,
          slideLayoutReference: { predefinedLayout: args.predefinedLayout },
        },
      };
      const res = await executeBatchUpdate(slides, args.presentationId, [request], 'add slide');
      const newId = res.replies?.[0]?.createSlide?.objectId ?? args.slideObjectId ?? null;

      // Follow-up read of the new slide's placeholders. createSlide's reply only
      // returns the slide objectId, but callers usually need to know which (if
      // any) placeholder shapes the layout produced — without this they can't
      // tell whether to call insertSlideText on an existing placeholder or
      // createSlideShape to add their own. On custom themes this often comes
      // back empty, which is itself the actionable signal.
      let placeholders: Array<{
        objectId: string;
        placeholderType: string | null;
        index: number | null;
        promptText: string | null;
      }> = [];
      if (newId) {
        try {
          const pageRes = await slides.presentations.pages.get({
            presentationId: args.presentationId,
            pageObjectId: newId,
          });
          const elements = pageRes.data.pageElements ?? [];
          for (const el of elements) {
            if (!el.shape?.placeholder || !el.objectId) continue;
            const promptText = (el.shape.text?.textElements ?? [])
              .map((te) => te.textRun?.content ?? '')
              .join('')
              .trim();
            placeholders.push({
              objectId: el.objectId,
              placeholderType: el.shape.placeholder.type ?? null,
              index: el.shape.placeholder.index ?? null,
              promptText: promptText || null,
            });
          }
        } catch (err: any) {
          log.warn(
            `addSlide created slide ${newId} but failed to fetch placeholders: ${err?.message ?? err}`
          );
        }
      }

      return JSON.stringify(
        {
          slideObjectId: newId,
          layout: args.predefinedLayout,
          placeholders,
          placeholderHint:
            placeholders.length === 0
              ? 'No placeholders produced (common on custom themes). Use createSlideShape to add a TEXT_BOX, then insertSlideText to populate it.'
              : `Use insertSlideText with one of these placeholder objectIds to populate text.`,
        },
        null,
        2
      );
    },
  });
}
