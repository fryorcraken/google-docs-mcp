import { describe, expect, it } from 'vitest';
import { extractSmartChips } from './smartChipHelpers.js';

const mockDocument = {
  body: {
    content: [
      {
        startIndex: 1,
        endIndex: 35,
        paragraph: {
          elements: [
            {
              startIndex: 1,
              endIndex: 2,
              dateElement: {
                dateId: 'date-1',
                dateElementProperties: {
                  displayText: '2026/05/07 15:30',
                  timestamp: '2026-05-07T06:30:00Z',
                  timeZoneId: 'Asia/Tokyo',
                },
              },
            },
            {
              startIndex: 2,
              endIndex: 3,
              richLink: {
                richLinkId: 'link-1',
                richLinkProperties: {
                  title: 'Planning Template',
                  uri: 'https://docs.google.com/document/d/example/edit',
                },
              },
            },
            {
              startIndex: 3,
              endIndex: 4,
              person: {
                personId: 'person-1',
                personProperties: {
                  name: 'Nguyen Hien',
                  email: 'hien@example.com',
                },
              },
            },
          ],
        },
      },
      {
        startIndex: 35,
        endIndex: 80,
        table: {
          tableRows: [
            {
              tableCells: [
                {
                  content: [
                    {
                      paragraph: {
                        elements: [
                          {
                            startIndex: 40,
                            endIndex: 41,
                            dateElement: {
                              dateId: 'date-2',
                              dateElementProperties: {
                                displayText: '2026/05/08',
                                timestamp: '2026-05-07T15:00:00Z',
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },
  tabs: [
    {
      tabProperties: {
        tabId: 'tab-1',
        title: 'Tab 1',
      },
      documentTab: {
        body: {
          content: [
            {
              startIndex: 1,
              endIndex: 10,
              paragraph: {
                elements: [
                  {
                    startIndex: 1,
                    endIndex: 2,
                    person: {
                      personId: 'person-tab',
                      personProperties: {
                        email: 'tab@example.com',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  ],
} as any;

describe('extractSmartChips', () => {
  it('extracts date, rich link, and person chips from body content and tables', () => {
    const chips = extractSmartChips(mockDocument);

    expect(chips).toEqual([
      {
        type: 'date',
        startIndex: 1,
        endIndex: 2,
        text: '2026/05/07 15:30',
        properties: {
          dateId: 'date-1',
          displayText: '2026/05/07 15:30',
          timestamp: '2026-05-07T06:30:00Z',
          timeZoneId: 'Asia/Tokyo',
        },
      },
      {
        type: 'richLink',
        startIndex: 2,
        endIndex: 3,
        text: 'Planning Template',
        properties: {
          richLinkId: 'link-1',
          title: 'Planning Template',
          uri: 'https://docs.google.com/document/d/example/edit',
        },
      },
      {
        type: 'person',
        startIndex: 3,
        endIndex: 4,
        text: 'Nguyen Hien',
        properties: {
          personId: 'person-1',
          name: 'Nguyen Hien',
          email: 'hien@example.com',
        },
      },
      {
        type: 'date',
        startIndex: 40,
        endIndex: 41,
        text: '2026/05/08',
        properties: {
          dateId: 'date-2',
          displayText: '2026/05/08',
          timestamp: '2026-05-07T15:00:00Z',
        },
      },
    ]);
  });

  it('can scope extraction to a specific tab', () => {
    const chips = extractSmartChips(mockDocument, 'tab-1');

    expect(chips).toEqual([
      {
        type: 'person',
        startIndex: 1,
        endIndex: 2,
        text: 'tab@example.com',
        properties: {
          personId: 'person-tab',
          email: 'tab@example.com',
        },
      },
    ]);
  });
});
