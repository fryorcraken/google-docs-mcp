import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listEvents',
    description:
      "Lists or searches Google Calendar events. Defaults to the user's primary calendar starting now. Use timeMin/timeMax (RFC3339 timestamps) to bound the window, q for free-text search, and maxResults to cap the count. Returns event IDs needed for updateEvent and deleteEvent.",
    parameters: z.object({
      calendarId: z
        .string()
        .optional()
        .default('primary')
        .describe('Calendar ID. Defaults to "primary" (the user\'s main calendar).'),
      q: z
        .string()
        .optional()
        .describe('Free-text search across summary, description, location, and attendees.'),
      timeMin: z
        .string()
        .optional()
        .describe(
          'Lower bound (inclusive) as RFC3339 timestamp, e.g. "2026-04-10T00:00:00-08:00". Defaults to now.'
        ),
      timeMax: z.string().optional().describe('Upper bound (exclusive) as RFC3339 timestamp.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(2500)
        .optional()
        .default(25)
        .describe('Maximum number of events to return (1-2500). Defaults to 25.'),
      singleEvents: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'If true (default), expands recurring events into individual instances. Set false to receive recurring events as a single record.'
        ),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      const timeMin = args.timeMin ?? new Date().toISOString();
      log.info(
        `Listing calendar events on ${args.calendarId} (timeMin=${timeMin}, q=${args.q ?? 'none'})`
      );

      try {
        const response = await calendar.events.list({
          calendarId: args.calendarId,
          q: args.q,
          timeMin,
          timeMax: args.timeMax,
          maxResults: args.maxResults,
          singleEvents: args.singleEvents,
          orderBy: args.singleEvents ? 'startTime' : undefined,
        });

        const events = (response.data.items ?? []).map((event) => ({
          id: event.id,
          status: event.status,
          summary: event.summary ?? null,
          description: event.description ?? null,
          location: event.location ?? null,
          start: event.start ?? null,
          end: event.end ?? null,
          attendees:
            event.attendees?.map((a) => ({
              email: a.email,
              responseStatus: a.responseStatus,
              optional: a.optional ?? false,
            })) ?? [],
          organizer: event.organizer?.email ?? null,
          htmlLink: event.htmlLink ?? null,
          recurringEventId: event.recurringEventId ?? null,
        }));

        return JSON.stringify(
          {
            events,
            count: events.length,
            nextPageToken: response.data.nextPageToken ?? null,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error listing calendar events: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Calendar not found (ID: ${args.calendarId}).`);
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Confirm the calendar.events scope was granted during consent.'
          );
        throw new UserError(`Failed to list events: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
