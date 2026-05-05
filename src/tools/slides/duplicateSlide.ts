import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'duplicateSlide',
    description:
      'Duplicates an existing slide in a presentation. The duplicate is inserted immediately after the source slide. Returns the new slide objectId.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      slideObjectId: z.string().min(1).describe('Slide objectId to duplicate.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Duplicating slide ${args.slideObjectId} in ${args.presentationId}`);
      const res = await executeBatchUpdate(
        slides,
        args.presentationId,
        [{ duplicateObject: { objectId: args.slideObjectId } }],
        'duplicate slide'
      );
      const newId = res.replies?.[0]?.duplicateObject?.objectId ?? null;
      return JSON.stringify(
        { duplicatedFrom: args.slideObjectId, newSlideObjectId: newId },
        null,
        2
      );
    },
  });
}
