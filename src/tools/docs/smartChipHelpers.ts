import { docs_v1 } from 'googleapis';
import { getContentSource } from './contentSource.js';

export interface ExtractedSmartChip {
  type: 'date' | 'richLink' | 'person';
  startIndex: number | null;
  endIndex: number | null;
  text?: string | null;
  properties: Record<string, unknown>;
}

function visitContent(
  content: docs_v1.Schema$StructuralElement[],
  out: ExtractedSmartChip[]
): void {
  for (const element of content) {
    for (const paragraphElement of element.paragraph?.elements ?? []) {
      if (paragraphElement.dateElement) {
        out.push({
          type: 'date',
          startIndex: paragraphElement.startIndex ?? null,
          endIndex: paragraphElement.endIndex ?? null,
          text: paragraphElement.dateElement.dateElementProperties?.displayText ?? null,
          properties: {
            dateId: paragraphElement.dateElement.dateId ?? null,
            ...paragraphElement.dateElement.dateElementProperties,
          },
        });
      }

      if (paragraphElement.richLink) {
        out.push({
          type: 'richLink',
          startIndex: paragraphElement.startIndex ?? null,
          endIndex: paragraphElement.endIndex ?? null,
          text: paragraphElement.richLink.richLinkProperties?.title ?? null,
          properties: {
            richLinkId: paragraphElement.richLink.richLinkId ?? null,
            ...paragraphElement.richLink.richLinkProperties,
          },
        });
      }

      if (paragraphElement.person) {
        out.push({
          type: 'person',
          startIndex: paragraphElement.startIndex ?? null,
          endIndex: paragraphElement.endIndex ?? null,
          text:
            paragraphElement.person.personProperties?.name ??
            paragraphElement.person.personProperties?.email ??
            null,
          properties: {
            personId: paragraphElement.person.personId ?? null,
            ...paragraphElement.person.personProperties,
          },
        });
      }
    }

    if (element.table?.tableRows) {
      for (const row of element.table.tableRows) {
        for (const cell of row.tableCells ?? []) {
          visitContent(cell.content ?? [], out);
        }
      }
    }
  }
}

export function extractSmartChips(
  doc: docs_v1.Schema$Document,
  tabId?: string
): ExtractedSmartChip[] {
  const content = getContentSource(doc, tabId);
  const chips: ExtractedSmartChip[] = [];
  visitContent(content, chips);
  return chips;
}
