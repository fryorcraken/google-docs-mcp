import { z } from 'zod';

export const eventDateTimeSchema = z
  .object({
    dateTime: z
      .string()
      .optional()
      .describe(
        'RFC3339 timestamp with timezone offset, e.g. "2026-04-15T14:00:00-08:00". Use this for timed events.'
      ),
    date: z
      .string()
      .optional()
      .describe('ISO date "YYYY-MM-DD" for all-day events. Use instead of dateTime.'),
    timeZone: z
      .string()
      .optional()
      .describe('IANA timezone like "America/Los_Angeles". Optional when dateTime has an offset.'),
  })
  .refine((v) => v.dateTime || v.date, {
    message: 'Provide either dateTime (timed event) or date (all-day event).',
  });
