import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getCalendarClient } from '../../clients.js';
import { eventDateTimeSchema } from './helpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createEvent',
    description:
      'Creates a new event on a Google Calendar. Supports timed events (start/end with dateTime) and all-day events (start/end with date). Set sendUpdates to email invitations to attendees.',
    parameters: z.object({
      calendarId: z
        .string()
        .optional()
        .default('primary')
        .describe('Calendar ID. Defaults to "primary".'),
      summary: z.string().describe('Event title.'),
      description: z.string().optional().describe('Event description / notes.'),
      location: z.string().optional().describe('Physical address or location string.'),
      start: eventDateTimeSchema.describe('Event start. Provide dateTime or date.'),
      end: eventDateTimeSchema.describe(
        'Event end. Provide dateTime or date. For all-day events, end.date is exclusive.'
      ),
      attendees: z
        .array(
          z.object({
            email: z.string().describe('Attendee email address.'),
            optional: z.boolean().optional().describe('Mark attendee as optional.'),
          })
        )
        .optional()
        .describe('List of attendees to invite.'),
      sendUpdates: z
        .enum(['all', 'externalOnly', 'none'])
        .optional()
        .default('none')
        .describe(
          'Whether to send email invitations: "all" sends to everyone, "externalOnly" only to non-domain attendees, "none" sends nothing (default).'
        ),
      conferenceData: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, attaches an automatically generated Google Meet link to the event.'),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Creating event "${args.summary}" on calendar ${args.calendarId}`);

      try {
        const response = await calendar.events.insert({
          calendarId: args.calendarId,
          sendUpdates: args.sendUpdates,
          conferenceDataVersion: args.conferenceData ? 1 : undefined,
          requestBody: {
            summary: args.summary,
            description: args.description,
            location: args.location,
            start: args.start,
            end: args.end,
            attendees: args.attendees,
            ...(args.conferenceData && {
              conferenceData: {
                createRequest: {
                  requestId: `mcp-${randomUUID()}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              },
            }),
          },
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
            hangoutLink: event.hangoutLink ?? null,
            attendees: event.attendees?.length ?? 0,
            message: `Event "${event.summary}" created.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error creating event: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Calendar not found (ID: ${args.calendarId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the calendar.events scope was granted.');
        if (error.code === 400)
          throw new UserError(
            `Calendar rejected the event: ${error.message || 'Bad request'}. Check that start/end formats are valid RFC3339.`
          );
        throw new UserError(`Failed to create event: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
