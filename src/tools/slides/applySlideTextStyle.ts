import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { slides_v1 } from 'googleapis';
import { getSlidesClient } from '../../clients.js';
import { hexToRgbColor, validateHexColor } from '../../types.js';
import { executeBatchUpdate } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'applySlideTextStyle',
    description:
      'Applies character-level text styling (bold, italic, underline, strikethrough, font size, font family, color) to a range of text within a shape on a slide. Omit textRange to style ALL text in the shape.',
    parameters: z.object({
      presentationId: z.string().min(1).describe('Presentation ID.'),
      shapeObjectId: z.string().min(1).describe('Shape objectId containing the text.'),
      textRange: z
        .object({
          startIndex: z.number().int().min(0).describe('0-based start (inclusive).'),
          endIndex: z.number().int().min(0).describe('0-based end (exclusive).'),
        })
        .optional()
        .describe('Range to style. If omitted, styles ALL text in the shape.'),
      style: z
        .object({
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
          underline: z.boolean().optional(),
          strikethrough: z.boolean().optional(),
          fontSize: z.number().min(1).optional().describe('Font size in points.'),
          fontFamily: z.string().optional(),
          foregroundColor: z
            .string()
            .refine(validateHexColor, { message: 'Invalid hex color (e.g., #FF0000 or #F00).' })
            .optional()
            .describe('Foreground color in hex (e.g., #FF0000).'),
        })
        .refine((s) => Object.values(s).some((v) => v !== undefined), {
          message: 'At least one style option must be provided.',
        }),
    }),
    execute: async (args, { log }) => {
      const slides = await getSlidesClient();
      log.info(
        `applySlideTextStyle on shape ${args.shapeObjectId} of ${args.presentationId} (range=${args.textRange ? `${args.textRange.startIndex}-${args.textRange.endIndex}` : 'ALL'})`
      );

      if (args.textRange && args.textRange.endIndex <= args.textRange.startIndex) {
        throw new UserError('textRange.endIndex must be greater than textRange.startIndex.');
      }

      const fields: string[] = [];
      const textStyle: slides_v1.Schema$TextStyle = {};

      if (args.style.bold !== undefined) {
        textStyle.bold = args.style.bold;
        fields.push('bold');
      }
      if (args.style.italic !== undefined) {
        textStyle.italic = args.style.italic;
        fields.push('italic');
      }
      if (args.style.underline !== undefined) {
        textStyle.underline = args.style.underline;
        fields.push('underline');
      }
      if (args.style.strikethrough !== undefined) {
        textStyle.strikethrough = args.style.strikethrough;
        fields.push('strikethrough');
      }
      if (args.style.fontSize !== undefined) {
        textStyle.fontSize = { magnitude: args.style.fontSize, unit: 'PT' };
        fields.push('fontSize');
      }
      if (args.style.fontFamily !== undefined) {
        textStyle.fontFamily = args.style.fontFamily;
        fields.push('fontFamily');
      }
      if (args.style.foregroundColor !== undefined) {
        const rgb = hexToRgbColor(args.style.foregroundColor);
        if (!rgb) throw new UserError(`Invalid hex color: ${args.style.foregroundColor}`);
        textStyle.foregroundColor = { opaqueColor: { rgbColor: rgb } };
        fields.push('foregroundColor');
      }

      // Defense in depth: the schema's `.refine(...)` only fires when
      // FastMCP validates input. Direct programmatic callers (or
      // composing tools) can bypass it; the Slides API would respond
      // with a generic 400. Surface a clearer error here.
      if (fields.length === 0) {
        throw new UserError('At least one style option must be provided.');
      }

      const range: slides_v1.Schema$Range = args.textRange
        ? {
            type: 'FIXED_RANGE',
            startIndex: args.textRange.startIndex,
            endIndex: args.textRange.endIndex,
          }
        : { type: 'ALL' };

      await executeBatchUpdate(
        slides,
        args.presentationId,
        [
          {
            updateTextStyle: {
              objectId: args.shapeObjectId,
              textRange: range,
              style: textStyle,
              fields: fields.join(','),
            },
          },
        ],
        'apply text style'
      );

      return `Successfully applied (${fields.join(', ')}) to shape ${args.shapeObjectId}.`;
    },
  });
}
