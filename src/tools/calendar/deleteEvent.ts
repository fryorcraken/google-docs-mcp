import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getCalendarClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteEvent',
    description:
      'Deletes an event from a Google Calendar. This is permanent — the event is removed, not trashed. Use sendUpdates to email cancellations to attendees.',
    parameters: z.object({
      calendarId: z
        .string()
        .optional()
        .default('primary')
        .describe('Calendar ID. Defaults to "primary".'),
      eventId: z.string().describe('The event ID to delete (from listEvents).'),
      sendUpdates: z
        .enum(['all', 'externalOnly', 'none'])
        .optional()
        .default('none')
        .describe('Whether to email cancellation notices to attendees.'),
    }),
    execute: async (args, { log }) => {
      const calendar = await getCalendarClient();
      log.info(`Deleting event ${args.eventId} from calendar ${args.calendarId}`);

      try {
        await calendar.events.delete({
          calendarId: args.calendarId,
          eventId: args.eventId,
          sendUpdates: args.sendUpdates,
        });

        return JSON.stringify(
          {
            success: true,
            eventId: args.eventId,
            calendarId: args.calendarId,
            message: `Event ${args.eventId} deleted from calendar ${args.calendarId}.`,
          },
          null,
          2
        );
      } catch (error: any) {
        log.error(`Error deleting event: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Event not found: ${args.eventId}.`);
        if (error.code === 410) throw new UserError(`Event ${args.eventId} was already deleted.`);
        if (error.code === 403)
          throw new UserError('Permission denied. Confirm the calendar.events scope was granted.');
        throw new UserError(`Failed to delete event: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
