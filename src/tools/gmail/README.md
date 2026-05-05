# Gmail

Tools for reading, drafting, sending, deleting, organizing, and triaging Gmail messages on the authenticated user's account. Uses the `gmail.modify` OAuth scope, which covers read, send, draft, label changes, and trash but **not** permanent message deletion.

## Messages

| Tool                  | Description                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `listMessages`        | Lists or searches messages using the full Gmail query syntax (e.g. `is:unread from:foo newer_than:7d`)   |
| `getMessage`          | Fetches a single message with decoded headers, plain-text body, HTML body, and attachment metadata       |
| `sendEmail`           | Sends a plain-text email; supports cc/bcc and threaded replies via `replyToMessageId`                    |
| `trashMessage`        | Moves a message to Trash (reversible from the Gmail UI Trash folder for 30 days). Not a permanent delete |
| `modifyMessageLabels` | Adds and/or removes labels on a message — used for star, archive, mark read, and custom-label tagging    |
| `listLabels`          | Lists all system and user-created Gmail labels with their IDs, for use with the other tools              |

## Drafts (compose / review / send)

| Tool          | Description                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `createDraft` | Creates a draft instead of sending. Use this when an AI composes an email the user should review |
| `listDrafts`  | Lists drafts with recipients, subject, and snippet                                               |
| `getDraft`    | Fetches one draft with full headers and body                                                     |
| `updateDraft` | Replaces a draft's contents (full replace, not patch). Use to iterate before sending             |
| `sendDraft`   | Sends an existing draft by ID — pairs with `createDraft` for the compose-review-send loop        |
| `deleteDraft` | Permanently deletes a draft. Not moved to Trash — gone                                           |

## Composite triage

| Tool          | Description                                                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `triageInbox` | One call returns N unread messages with full content + per-message heuristic flags (newsletter detection via `List-Unsubscribe`, meeting reference, contains question, action requested) PLUS aggregate stats (top senders, category breakdown). Designed for AI inbox triage in a single round-trip |

## Common label IDs

System labels you can pass to `modifyMessageLabels` and `listMessages.labelIds` without calling `listLabels` first:

- `INBOX`, `SENT`, `DRAFT`, `TRASH`, `SPAM`
- `UNREAD`, `STARRED`, `IMPORTANT`
- `CATEGORY_PERSONAL`, `CATEGORY_SOCIAL`, `CATEGORY_PROMOTIONS`, `CATEGORY_UPDATES`, `CATEGORY_FORUMS`

Custom labels (anything you created in the Gmail UI) have opaque IDs like `Label_1234567890` — fetch them with `listLabels`.
