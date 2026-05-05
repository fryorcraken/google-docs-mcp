import type { FastMCP } from 'fastmcp';
import { register as listEvents } from './listEvents.js';
import { register as createEvent } from './createEvent.js';
import { register as updateEvent } from './updateEvent.js';
import { register as deleteEvent } from './deleteEvent.js';
import { register as quickAddEvent } from './quickAddEvent.js';

export function registerCalendarTools(server: FastMCP) {
  listEvents(server);
  createEvent(server);
  updateEvent(server);
  deleteEvent(server);
  quickAddEvent(server);
}
