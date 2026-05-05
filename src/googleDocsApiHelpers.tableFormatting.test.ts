import { describe, expect, it } from 'vitest';
import {
  buildTableCellStyleRequest,
  buildTableBorder,
  buildTableColumnWidthRequest,
  buildTableRowStyleRequest,
  buildPinTableHeaderRowsRequest,
} from './googleDocsApiHelpers.js';
import { hexToRgbColor } from './types.js';

describe('table formatting request builders', () => {
  it('builds updateTableCellStyle requests with range and fields', () => {
    const border = buildTableBorder(hexToRgbColor('#000000')!, 1, 'SOLID');
    const result = buildTableCellStyleRequest(
      25,
      0,
      0,
      {
        rowSpan: 2,
        columnSpan: 3,
        backgroundColor: hexToRgbColor('#D9E2F3')!,
        contentAlignment: 'MIDDLE',
        paddingTopPt: 8,
        borderTop: border,
      },
      'tab-1'
    );

    expect(result).not.toBeNull();
    expect(result!.fields).toEqual([
      'backgroundColor',
      'contentAlignment',
      'paddingTop',
      'borderTop',
    ]);
    expect(
      result!.request.updateTableCellStyle!.tableRange!.tableCellLocation!.tableStartLocation
    ).toEqual({
      index: 25,
      tabId: 'tab-1',
    });
    expect(result!.request.updateTableCellStyle!.tableRange!.rowSpan).toBe(2);
    expect(result!.request.updateTableCellStyle!.tableRange!.columnSpan).toBe(3);
    expect(result!.request.updateTableCellStyle!.tableCellStyle!.contentAlignment).toBe('MIDDLE');
  });

  it('builds fixed-width column property requests', () => {
    const request = buildTableColumnWidthRequest(50, [0, 2], 120, 'tab-2');
    const props: any = request.updateTableColumnProperties;

    expect(props.tableStartLocation).toEqual({ index: 50, tabId: 'tab-2' });
    expect(props.columnIndices).toEqual([0, 2]);
    expect(props.tableColumnProperties.widthType).toBe('FIXED_WIDTH');
    expect(props.tableColumnProperties.width).toEqual({ magnitude: 120, unit: 'PT' });
  });

  it('builds row style requests only when fields are provided', () => {
    const request = buildTableRowStyleRequest(75, [0, 1], 36, true, 'tab-3') as any;

    expect(request.updateTableRowStyle.tableStartLocation).toEqual({ index: 75, tabId: 'tab-3' });
    expect(request.updateTableRowStyle.rowIndices).toEqual([0, 1]);
    expect(request.updateTableRowStyle.tableRowStyle.minRowHeight).toEqual({
      magnitude: 36,
      unit: 'PT',
    });
    expect(request.updateTableRowStyle.tableRowStyle.preventOverflow).toBe(true);
    expect(request.updateTableRowStyle.fields).toBe('minRowHeight,preventOverflow');
    expect(buildTableRowStyleRequest(10, [0], undefined, undefined)).toBeNull();
  });

  it('builds pinTableHeaderRows requests', () => {
    const request: any = buildPinTableHeaderRowsRequest(99, 1, 'tab-4');
    expect(request.pinTableHeaderRows.tableStartLocation).toEqual({ index: 99, tabId: 'tab-4' });
    expect(request.pinTableHeaderRows.pinnedHeaderRowsCount).toBe(1);
  });
});
