import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { slides_v1 } from 'googleapis';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertSlideImage',
    description:
      'Inserts an image into a slide from a public URL. The image must be publicly accessible (HTTP/HTTPS). To insert local files, upload them to Drive first and use the Drive sharing URL. Returns the new image objectId.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      slideObjectId: z.string().min(1).describe('Target slide objectId.'),
      imageUrl: z
        .string()
        .url()
        .refine((u) => /^https?:\/\//i.test(u), { message: 'Only http/https URLs are allowed.' })
        .describe('Public URL of the image (must be reachable by Google servers).'),
      position: z
        .object({
          xPt: z.number().describe('X offset from slide top-left in points (PT).'),
          yPt: z.number().describe('Y offset from slide top-left in points (PT).'),
        })
        .optional()
        .describe('Optional position. Defaults to slide-relative anchor chosen by the API.'),
      size: z
        .object({
          widthPt: z.number().min(1).describe('Width in points.'),
          heightPt: z.number().min(1).describe('Height in points.'),
        })
        .optional()
        .describe("Optional size. Defaults to the image's native dimensions."),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `insertSlideImage on slide ${args.slideObjectId} of ${args.presentationId} (url: ${args.imageUrl})`
      );

      const elementProperties: slides_v1.Schema$PageElementProperties = {
        pageObjectId: args.slideObjectId,
      };
      if (args.size) {
        elementProperties.size = {
          width: { magnitude: args.size.widthPt, unit: 'PT' },
          height: { magnitude: args.size.heightPt, unit: 'PT' },
        };
      }
      if (args.position) {
        elementProperties.transform = {
          scaleX: 1,
          scaleY: 1,
          translateX: args.position.xPt,
          translateY: args.position.yPt,
          unit: 'PT',
        };
      }

      const res = await executeBatchUpdate(
        slides,
        args.presentationId,
        [
          {
            createImage: {
              url: args.imageUrl,
              elementProperties,
            },
          },
        ],
        'insert image'
      );
      const newId = res.replies?.[0]?.createImage?.objectId ?? null;
      return JSON.stringify({ imageObjectId: newId, slideObjectId: args.slideObjectId }, null, 2);
    },
  });
}
