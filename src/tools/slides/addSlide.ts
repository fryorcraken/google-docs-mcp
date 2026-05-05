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
      'Inserts a new slide into a Google Slides presentation. Returns the new slide objectId. Use one of the predefined layouts (TITLE_AND_BODY is the common default) or BLANK for an empty slide.',
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
      return JSON.stringify({ slideObjectId: newId, layout: args.predefinedLayout }, null, 2);
    },
  });
}
