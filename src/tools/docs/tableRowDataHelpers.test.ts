import { describe, expect, it } from 'vitest';
import {
  buildReplaceTableCellContentRequests,
  buildReplaceTableRowRequests,
} from './tableRowDataHelpers.js';

describe('buildReplaceTableCellContentRequests', () => {
  it('builds delete + insert requests for a populated cell', () => {
    const requests = buildReplaceTableCellContentRequests(
      {
        rowIndex: 1,
        columnIndex: 2,
        startIndex: 100,
        endIndex: 120,
        contentStartIndex: 101,
        contentEndIndex: 110,
        text: 'Old value',
      },
      'New value'
    );

    expect(requests).toHaveLength(2);
    expect(requests[0].deleteContentRange?.range).toEqual({
      startIndex: 101,
      endIndex: 109,
    });
    expect(requests[1].insertText?.location?.index).toBe(101);
    expect(requests[1].insertText?.text).toBe('New value');
  });

  it('builds insert-only requests for an empty cell with a writable content index', () => {
    const requests = buildReplaceTableCellContentRequests(
      {
        rowIndex: 0,
        columnIndex: 0,
        startIndex: 50,
        endIndex: 60,
        contentStartIndex: 51,
        contentEndIndex: 52,
        text: '',
      },
      'Value'
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].insertText?.location?.index).toBe(51);
    expect(requests[0].insertText?.text).toBe('Value');
  });

  it('builds delete-only requests when replacing with an empty string', () => {
    const requests = buildReplaceTableCellContentRequests(
      {
        rowIndex: 0,
        columnIndex: 1,
        startIndex: 70,
        endIndex: 90,
        contentStartIndex: 71,
        contentEndIndex: 75,
        text: 'ABC',
      },
      ''
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].deleteContentRange?.range).toEqual({
      startIndex: 71,
      endIndex: 74,
    });
  });

  it('builds one atomic request list for the whole row in reverse column order', () => {
    const requests = buildReplaceTableRowRequests(
      {
        tableId: 'table:body:1',
        ordinal: 1,
        startIndex: 100,
        endIndex: 140,
        rowCount: 2,
        columnCount: 2,
        cells: [
          {
            rowIndex: 1,
            columnIndex: 0,
            startIndex: 101,
            endIndex: 110,
            contentStartIndex: 102,
            contentEndIndex: 105,
            text: 'A',
          },
          {
            rowIndex: 1,
            columnIndex: 1,
            startIndex: 110,
            endIndex: 120,
            contentStartIndex: 111,
            contentEndIndex: 114,
            text: 'B',
          },
        ],
      },
      1,
      ['left', 'right']
    );

    expect(requests).toHaveLength(4);
    expect(requests[0].deleteContentRange?.range).toEqual({ startIndex: 111, endIndex: 113 });
    expect(requests[1].insertText?.location?.index).toBe(111);
    expect(requests[1].insertText?.text).toBe('right');
    expect(requests[2].deleteContentRange?.range).toEqual({ startIndex: 102, endIndex: 104 });
    expect(requests[3].insertText?.location?.index).toBe(102);
    expect(requests[3].insertText?.text).toBe('left');
  });
});
