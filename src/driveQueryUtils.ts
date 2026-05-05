/**
 * Escapes a string for safe interpolation into Google Drive API query strings.
 * Backslashes must be escaped first, then single quotes (order matters).
 */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
