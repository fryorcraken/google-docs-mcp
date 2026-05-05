# Calendar

Tools for reading, creating, editing, and deleting events on Google Calendar. Uses the `calendar.events` OAuth scope (events only — does not allow creating or deleting calendars themselves).

| Tool            | Description                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `listEvents`    | Lists or searches events on a calendar with `q`, `timeMin`, `timeMax`, `maxResults`                 |
| `createEvent`   | Creates a structured event with title, start/end, description, location, attendees, optional Meet   |
| `updateEvent`   | PATCH semantics — updates only the fields you provide. Use to reschedule, retitle, change attendees |
| `deleteEvent`   | Permanently deletes an event. Optional `sendUpdates` emails cancellations to attendees              |
| `quickAddEvent` | Natural-language event creation: pass "Lunch with Sarah tomorrow 12pm" and Google parses the rest   |

## Calendar IDs

All tools default `calendarId` to `"primary"` — the user's main calendar. To target a different calendar (shared, secondary, etc.), pass its calendar ID. Calendar IDs look like `username@example.com` or `c_abc123def456@group.calendar.google.com`.

## Date/time formats

Events accept two formats for `start` and `end`:

- **Timed events**: `{ "dateTime": "2026-04-15T14:00:00-08:00", "timeZone": "America/Los_Angeles" }` (RFC3339 with timezone offset)
- **All-day events**: `{ "date": "2026-04-15" }` (ISO date). For multi-day all-day events, `end.date` is exclusive.

## sendUpdates options

`createEvent`, `updateEvent`, and `deleteEvent` accept a `sendUpdates` parameter:

- `"none"` (default) — don't email anyone
- `"externalOnly"` — only email non-domain attendees
- `"all"` — email everyone

The default is `"none"` to avoid surprising users with unsolicited invites/cancellations.
