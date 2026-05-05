import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createPresentation',
    description:
      'Creates a new Google Slides presentation. Returns the presentationId, which other slides tools accept as their primary identifier.',
    parameters: z.object({
      title: z.string().min(1).describe('Title of the new presentation.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Creating presentation: "${args.title}"`);
      try {
        const res = await slides.presentations.create({
          requestBody: { title: args.title },
        });
        const id = res.data.presentationId;
        if (!id) throw new UserError('Slides API returned no presentationId.');
        return JSON.stringify(
          {
            presentationId: id,
            title: res.data.title ?? args.title,
            url: `https://docs.google.com/presentation/d/${id}/edit`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error creating presentation: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 403) {
          throw new UserError(
            'Permission denied. Ensure the Slides API is enabled for the OAuth client and the user has the presentations scope.'
          );
        }
        throw new UserError(`Failed to create presentation: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
