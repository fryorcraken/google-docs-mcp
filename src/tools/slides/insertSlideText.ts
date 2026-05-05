import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { executeBatchUpdate } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertSlideText',
    description:
      'Inserts text into a specific shape on a slide. Use readPresentation with format="json" to find the shape objectId. To overwrite existing content, call deleteSlideText first or use replaceAllText for placeholder swaps.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      shapeObjectId: z
        .string()
        .min(1)
        .describe(
          'objectId of the shape (text frame) to insert into. Found via readPresentation format="json".'
        ),
      text: z.string().min(1).describe('Text to insert.'),
      insertionIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('0-based character index within the shape. Default appends at the end.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `insertSlideText into shape ${args.shapeObjectId} of ${args.presentationId} (${args.text.length} chars)`
      );
      await executeBatchUpdate(
        slides,
        args.presentationId,
        [
          {
            insertText: {
              objectId: args.shapeObjectId,
              text: args.text,
              insertionIndex: args.insertionIndex,
            },
          },
        ],
        'insert slide text'
      );
      return `Successfully inserted ${args.text.length} chars into shape ${args.shapeObjectId}.`;
    },
  });
}
