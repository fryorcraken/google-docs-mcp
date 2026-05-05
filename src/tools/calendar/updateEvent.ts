import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { calendar_v3 } from 'googleapis';
import { getCalendarClient } from '../../clients.js';
import { eventDateTimeSchema } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'updateEvent',
    description:
      'Updates an existing Google Calendar event with PATCH semantics — only the fields you provide are changed; everything else stays the same. Common uses: reschedule (set start+end), retitle (set summary), add/remove attendees (set attendees array which fully replaces).',
    parameters: z.object({
      calendarId: z
        .string()
        .optional()
        .default('primary')
        .describe('Calendar ID. Defaults to "primary".'),
      eventId: z.string().describe('The event ID to update (from listEvents).'),
      summary: z.string().optional().describe('New event title.'),
      description: z.string().optional().describe('New event description.'),
      location: z.string().optional().describe('New location.'),
      start: eventDateTimeSchema.optional().describe('New start time.'),
      end: eventDateTimeSchema.optional().describe('New end time.'),
      attendees: z
        .array(
          z.object({
            email: z.string(),
            optional: z.boolean().optional(),
          })
        )
        .optional()
        .describe('Replaces the entire attendee list. To add one, fetch the event first.'),
      sendUpdates: z
        .enum(['all', 'externalOnly', 'none'])
        .optional()
        .default('none')
        .describe('Whether to email attendees about the change.'),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Patching event ${args.eventId} on calendar ${args.calendarId}`);

      const requestBody: Partial<calendar_v3.Schema$Event> = {};
      if (args.summary !== undefined) requestBody.summary = args.summary;
      if (args.description !== undefined) requestBody.description = args.description;
      if (args.location !== undefined) requestBody.location = args.location;
      if (args.start !== undefined) requestBody.start = args.start;
      if (args.end !== undefined) requestBody.end = args.end;
      if (args.attendees !== undefined) requestBody.attendees = args.attendees;

      if (Object.keys(requestBody).length === 0) {
        throw new UserError(
          'No fields provided to update. Pass at least one of summary, description, location, start, end, or attendees.'
        );
      }

      try {
        const response = await calendar.events.patch({
          calendarId: args.calendarId,
          eventId: args.eventId,
          sendUpdates: args.sendUpdates,
          requestBody,
        });

        const event = response.data;
        return JSON.stringify(
          {
            success: true,
            id: event.id,
            summary: event.summary,
            start: event.start,
            end: event.end,
            htmlLink: event.htmlLink,
            updated: event.updated,
            message: `Event ${event.id} updated.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error updating event: ${error.message || error}`);
        if (error.code === 404)
          throw new UserError(`Event not found: ${args.eventId} on calendar ${args.calendarId}.`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the calendar.events scope was granted.');
        if (error.code === 400)
          throw new UserError(`Calendar rejected the update: ${error.message || 'Bad request'}.`);
        throw new UserError(`Failed to update event: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
