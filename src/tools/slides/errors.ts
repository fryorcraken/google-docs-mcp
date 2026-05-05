import { UserError } from 'fastmcp';

/**
 * Translates a googleapis Slides error into a user-actionable {@link UserError}.
 *
 * Returns `null` when the error doesn't match any known pattern (callers
 * should re-throw or wrap it themselves).
 *
 * `verb` should be a present-tense action like "create presentation",
 * "read presentation", "list slides" — used in the fallback message.
 *
 * Detected patterns:
 * - 403 with `accessNotConfigured` reason → "enable the Slides API"
 *   (this is the most common slice-1 setup failure and the setup skill
 *   tells users about it; we surface it specifically rather than
 *   collapsing into a generic permission denial)
 * - 403 (other) → permission denied
 * - 404 → resource not found
 */
export function translateSlidesError(error: any, verb: string): UserError | null {
  const message: string = error?.message ?? '';
  const reason: string | undefined = error?.errors?.[0]?.reason;

  if (
    error?.code === 403 &&
    (reason === 'accessNotConfigured' || /has not been used in project/i.test(message))
  ) {
    return new UserError(
      'Google Slides API is not enabled for this OAuth project. ' +
        'Enable it at https://console.cloud.google.com/apis/library/slides.googleapis.com ' +
        'and retry. (See the setup-google-docs-mcp skill, step 1.3.)'
    );
  }

  if (error?.code === 403) {
    return new UserError(
      `Permission denied while trying to ${verb}. Ensure the user has access and the presentations scope is granted.`
    );
  }

  if (error?.code === 404) {
    return new UserError(`Presentation not found while trying to ${verb}.`);
  }

  return null;
}
