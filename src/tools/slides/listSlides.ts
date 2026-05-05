import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSlidesClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listSlides',
    description:
      'Lists slides in a Google Slides presentation with their objectIds and a brief summary. Use the returned objectIds with slide-specific edit tools.',
    parameters: z.object({
      presentationId: z
        .string()
        .min(1)
        .describe('Presentation ID — the long string between /d/ and /edit in a Slides URL.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Listing slides in ${args.presentationId}`);
      try {
        const res = await slides.presentations.get({ presentationId: args.presentationId });
        const slideList = res.data.slides ?? [];
        const items = slideList.map((slide, index) => {
          const elementCount = slide.pageElements?.length ?? 0;
          // First non-empty text element makes a useful "preview" without reading
          // the whole slide.
          let preview: string | undefined;
          for (const el of slide.pageElements ?? []) {
            const text = (el.shape?.text?.textElements ?? [])
              .map((te) => te.textRun?.content ?? '')
              .join('')
              .trim();
            if (text) {
              preview = text.length > 80 ? text.slice(0, 77) + '...' : text;
              break;
            }
          }
          return {
            index: index + 1,
            objectId: slide.objectId,
            elementCount,
            preview: preview ?? null,
          };
        });
        return JSON.stringify(
          {
            presentationId: args.presentationId,
            title: res.data.title ?? null,
            slideCount: items.length,
            slides: items,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error listing slides for ${args.presentationId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404)
          throw new UserError(`Presentation not found (ID: ${args.presentationId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for presentation (ID: ${args.presentationId}).`);
        throw new UserError(`Failed to list slides: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
