import { slides_v1 } from 'googleapis';
import { UserError } from 'fastmcp';
import { translateSlidesError } from './errors.js';

type Slides = slides_v1.Slides;

/**
 * Wraps a single `presentations.batchUpdate` call with consistent error
 * translation. Keeps each tool's `execute` body short and uniform.
 */
export async function executeBatchUpdate(
  slides: Slides,
  presentationId: string,
  requests: slides_v1.Schema$Request[],
  verb: string
): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
  if (!requests || requests.length === 0) return {};
  try {
    const res = await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests },
    });
    return res.data;
  } catch (error: any) {
    const translated = translateSlidesError(error, verb);
    if (translated) throw translated;
    if (error?.code === 400) {
      const detail = error?.response?.data?.error?.message ?? error?.message ?? 'unknown 400 error';
      throw new UserError(`Slides API rejected the request while trying to ${verb}: ${detail}`);
    }
    throw new UserError(`Failed to ${verb}: ${error?.message ?? 'Unknown error'}`);
  }
}
