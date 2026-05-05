import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { slides_v1 } from 'googleapis';
import { getSlidesClient } from '../../clients.js';

const PresentationIdParameter = z.object({
  presentationId: z
    .string()
    .min(1)
    .describe('Presentation ID — the long string between /d/ and /edit in a Google Slides URL.'),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'readPresentation',
    description:
      "Reads a Google Slides presentation. Default 'text' format extracts visible text from each slide; 'json' returns the raw API structure (use for finding object IDs and indices when editing).",
    parameters: PresentationIdParameter.extend({
      format: z
        .enum(['text', 'json'])
        .optional()
        .default('text')
        .describe(
          "Output format: 'text' (per-slide text dump) or 'json' (raw Slides API structure)."
        ),
      maxLength: z
        .number()
        .optional()
        .describe('Maximum character limit for output. Truncates if exceeded.'),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(`Reading presentation ${args.presentationId} (format: ${args.format})`);

      try {
        const res = await slides.presentations.get({
          presentationId: args.presentationId,
        });

        if (args.format === 'json') {
          const json = JSON.stringify(res.data, null, 2);
          if (args.maxLength && json.length > args.maxLength) {
            return (
              json.substring(0, args.maxLength) +
              `\n... [JSON truncated: ${json.length} total chars]`
            );
          }
          return json;
        }

        // Text format: dump per-slide text content
        const slideList = res.data.slides ?? [];
        if (slideList.length === 0) {
          return `Presentation "${res.data.title ?? '(untitled)'}" has no slides.`;
        }

        const lines: string[] = [
          `Presentation: ${res.data.title ?? '(untitled)'} (${slideList.length} slide${slideList.length === 1 ? '' : 's'})`,
          '',
        ];
        slideList.forEach((slide, index) => {
          lines.push(`--- Slide ${index + 1} (objectId: ${slide.objectId}) ---`);
          const slideText = extractSlideText(slide);
          lines.push(slideText.length > 0 ? slideText : '(no text content)');
          lines.push('');
        });

        const text = lines.join('\n');
        if (args.maxLength && text.length > args.maxLength) {
          return (
            text.substring(0, args.maxLength) +
            `\n... [Content truncated: ${text.length} total chars]`
          );
        }
        return text;
      } catch (error: any) {
        log.error(`Error reading presentation ${args.presentationId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        if (error.code === 404)
          throw new UserError(`Presentation not found (ID: ${args.presentationId}).`);
        if (error.code === 403)
          throw new UserError(`Permission denied for presentation (ID: ${args.presentationId}).`);
        throw new UserError(`Failed to read presentation: ${error.message || 'Unknown error'}`);
      }
    },
  });
}

/**
 * Extracts visible text from a slide by walking pageElements and pulling
 * textElements out of any shape with a text body. Skips images, lines, etc.
 */
function extractSlideText(slide: slides_v1.Schema$Page): string {
  const elements = slide.pageElements ?? [];
  const out: string[] = [];

  for (const el of elements) {
    const textElements = el.shape?.text?.textElements ?? [];
    const text = textElements
      .map((te) => te.textRun?.content ?? '')
      .join('')
      .trim();
    if (text) out.push(text);
  }

  return out.join('\n');
}
