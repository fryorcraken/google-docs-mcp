import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { slides_v1 } from 'googleapis';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

// Subset of the Slides API ShapeType enum that callers actually want to add to
// a slide programmatically. The full enum has ~150 entries (mostly autoshapes);
// expose the common ones and let callers pass any string for the rest via the
// passthrough `shapeType` schema below.
const COMMON_SHAPE_TYPES = [
  'TEXT_BOX',
  'RECTANGLE',
  'ROUND_RECTANGLE',
  'ELLIPSE',
  'ARROW',
  'TRIANGLE',
  'RIGHT_TRIANGLE',
  'DIAMOND',
  'PARALLELOGRAM',
  'TRAPEZOID',
  'PENTAGON',
  'HEXAGON',
  'OCTAGON',
  'STAR_5',
  'CLOUD',
  'SPEECH',
] as const;

export function register(server: FastMCP) {
  server.addTool({
    name: 'createSlideShape',
    description:
      'Creates a shape (default TEXT_BOX) on a slide and returns its objectId. Use this to add a text frame to a slide that has no body placeholder (e.g. a slide created via addSlide on a custom theme, or a BLANK layout). Chain the returned objectId with insertSlideText / applySlideTextStyle to populate it.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      slideObjectId: z.string().min(1).describe('Target slide objectId.'),
      shapeType: z
        .string()
        .min(1)
        .optional()
        .default('TEXT_BOX')
        .describe(
          `Slides API ShapeType. Defaults to TEXT_BOX. Common values: ${COMMON_SHAPE_TYPES.join(', ')}. See https://developers.google.com/slides/api/reference/rest/v1/presentations.pages/shapeType for the full enum.`
        ),
      position: z
        .object({
          xPt: z.number().describe('X offset from slide top-left in points (PT).'),
          yPt: z.number().describe('Y offset from slide top-left in points (PT).'),
        })
        .describe('Position of the shape on the slide in points.'),
      size: z
        .object({
          widthPt: z.number().min(1).describe('Width in points.'),
          heightPt: z.number().min(1).describe('Height in points.'),
        })
        .describe('Size of the shape in points.'),
      shapeObjectId: z
        .string()
        .min(5)
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, {
          message: 'shapeObjectId must match [a-zA-Z0-9_-]+ (Slides API requirement).',
        })
        .optional()
        .describe(
          'Optional explicit objectId for the new shape. Auto-generated if omitted. Must be 5–50 chars, [a-zA-Z0-9_-].'
        ),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `createSlideShape on slide ${args.slideObjectId} of ${args.presentationId} (type: ${args.shapeType})`
      );

      const elementProperties: slides_v1.Schema$PageElementProperties = {
        pageObjectId: args.slideObjectId,
        size: {
          width: { magnitude: args.size.widthPt, unit: 'PT' },
          height: { magnitude: args.size.heightPt, unit: 'PT' },
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          translateX: args.position.xPt,
          translateY: args.position.yPt,
          unit: 'PT',
        },
      };

      const request: slides_v1.Schema$Request = {
        createShape: {
          objectId: args.shapeObjectId,
          shapeType: args.shapeType,
          elementProperties,
        },
      };

      const res = await executeBatchUpdate(
        slides,
        args.presentationId,
        [request],
        'create slide shape'
      );
      const newId = res.replies?.[0]?.createShape?.objectId ?? args.shapeObjectId ?? null;
      return JSON.stringify(
        {
          shapeObjectId: newId,
          slideObjectId: args.slideObjectId,
          shapeType: args.shapeType,
        },
        null,
        2
      );
    },
  });
}
