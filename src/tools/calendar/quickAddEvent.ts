import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'quickAddEvent',
    description:
      'Creates a calendar event from a natural-language string using Google Calendar\'s quick-add parser. Examples: "Lunch with Sarah tomorrow at 12pm", "Dentist appointment next Tuesday 3-4pm", "Team standup every weekday 9am". Faster than createEvent when you don\'t need attendees, descriptions, or precise control over fields.',
    parameters: z.object({
      calendarId: z
        .string()
        .optional()
        .default('primary')
        .describe('Calendar ID. Defaults to "primary".'),
      text: z
        .string()
        .describe(
          'Natural-language description of the event. Google parses the title and time from this string.'
        ),
      sendUpdates: z
        .enum(['all', 'externalOnly', 'none'])
        .optional()
        .default('none')
        .describe('Whether to email invitations (rarely useful for quick add).'),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Quick-adding event on ${args.calendarId}: "${args.text}"`);

      try {
        const response = await calendar.events.quickAdd({
          calendarId: args.calendarId,
          text: args.text,
          sendUpdates: args.sendUpdates,
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
            message: `Event "${event.summary}" created from "${args.text}".`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error quick-adding event: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Calendar not found (ID: ${args.calendarId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the calendar.events scope was granted.');
        if (error.code === 400)
          throw new UserError(
            `Calendar could not parse "${args.text}" as an event. Try a clearer time format.`
          );
        throw new UserError(`Failed to quick-add event: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
