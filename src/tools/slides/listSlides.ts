import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { slides_v1 } from 'googleapis';
import { getSlidesClient } from '../../clients.js';
import { translateSlidesError } from './errors.js';

/**
 * Returns a short preview string for a slide. Prefers a TITLE/CENTERED_TITLE
 * placeholder when present (typical "deck navigation" preview), falling back
 * to the first non-empty text element. Returns undefined if neither yields
 * any text.
 */
function pickSlidePreview(slide: slides_v1.Schema$Page): string | undefined {
  const elements = slide.pageElements ?? [];
  const textOf = (el: slides_v1.Schema$PageElement): string =>
    (el.shape?.text?.textElements ?? [])
      .map((te) => te.textRun?.content ?? '')
      .join('')
      .trim();

  const titleEl = elements.find((el) => {
    const t = el.shape?.placeholder?.type;
    return t === 'TITLE' || t === 'CENTERED_TITLE';
  });
  const titleText = titleEl ? textOf(titleEl) : '';
  const candidate = titleText || elements.map(textOf).find((t) => t) || '';
  if (!candidate) return undefined;
  return candidate.length > 80 ? candidate.slice(0, 77) + '...' : candidate;
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'listSlides',
    description:
      'Lists slides in a Google Slides presentation with their objectIds and a brief summary. Use the returned objectIds with slide-specific edit tools. NOTE: `elementCount: 0` means the slide has no page elements (no placeholders, no shapes) — typical for a slide just created via addSlide on a custom theme. To put text on such a slide, call createSlideShape first to add a TEXT_BOX, then insertSlideText.',
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
        const items = slideList.map((slide, index) => ({
          index: index + 1,
          objectId: slide.objectId,
          elementCount: slide.pageElements?.length ?? 0,
          preview: pickSlidePreview(slide) ?? null,
        }));
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
        const translated = translateSlidesError(error, 'list slides');
        if (translated) throw translated;
        throw new UserError(`Failed to list slides: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
