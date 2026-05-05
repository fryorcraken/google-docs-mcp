import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';
import { translateSlidesError } from './errors.js';

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
        // Slides API contract: a 200 response always includes presentationId.
        // Treat the absence as an internal/programmer error, not user-actionable.
        if (!id) throw new Error('Slides API returned a 200 with no presentationId.');
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
        const translated = translateSlidesError(error, 'create presentation');
        if (translated) throw translated;
        throw error;
      }
    },
  });
}
