import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'moveSlide',
    description:
      'Moves a slide to a different position within the presentation. The newIndex is the 0-based target position in the slide order after removal.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      slideObjectId: z.string().min(1).describe('Slide objectId to move.'),
      newIndex: z
        .number()
        .int()
        .min(0)
        .describe('0-based target position. The slide is repositioned in the deck order.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `Moving slide ${args.slideObjectId} to index ${args.newIndex} in ${args.presentationId}`
      );
      await executeBatchUpdate(
        slides,
        args.presentationId,
        [
          {
            updateSlidesPosition: {
              slideObjectIds: [args.slideObjectId],
              insertionIndex: args.newIndex,
            },
          },
        ],
        'move slide'
      );
      return `Successfully moved slide ${args.slideObjectId} to index ${args.newIndex}.`;
    },
  });
}
