import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteSlide',
    description:
      'Deletes a slide from a Google Slides presentation. Use listSlides to find the slide objectId.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      slideObjectId: z
        .string()
        .min(1)
        .describe('Slide objectId returned by listSlides or readPresentation.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Deleting slide ${args.slideObjectId} from ${args.presentationId}`);
      await executeBatchUpdate(
        slides,
        args.presentationId,
        [{ deleteObject: { objectId: args.slideObjectId } }],
        'delete slide'
      );
      return `Successfully deleted slide ${args.slideObjectId}.`;
    },
  });
}
