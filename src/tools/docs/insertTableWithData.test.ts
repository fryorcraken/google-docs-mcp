import { describe, it, expect } from 'vitest';
import { buildInsertTableWithDataRequests } from './insertTableWithData.js';

describe('buildInsertTableWithDataRequests', () => {
  describe('table structure', () => {
    it('should create an insertTable request with correct dimensions', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['A', 'B'],
          ['C', 'D'],
        ],
        1,
        false
      );

      const tableReq = requests.find((r) => r.insertTable);
      expect(tableReq).toBeDefined();
      expect(tableReq!.insertTable!.rows).toBe(2);
      expect(tableReq!.insertTable!.columns).toBe(2);
      expect(tableReq!.insertTable!.location!.index).toBe(1);
    });

    it('should create a single-cell table', () => {
      const requests = buildInsertTableWithDataRequests([['Only']], 1, false);

      const tableReq = requests.find((r) => r.insertTable);
      expect(tableReq!.insertTable!.rows).toBe(1);
      expect(tableReq!.insertTable!.columns).toBe(1);

      const insertTexts = requests.filter((r) => r.insertText);
      expect(insertTexts).toHaveLength(1);
      expect(insertTexts[0].insertText!.text).toBe('Only');
    });

    it('should pad ragged rows to the widest row', () => {
      const requests = buildInsertTableWithDataRequests([['A', 'B', 'C'], ['D']], 1, false);

      const tableReq = requests.find((r) => r.insertTable);
      expect(tableReq!.insertTable!.rows).toBe(2);
      expect(tableReq!.insertTable!.columns).toBe(3);

      // Only non-empty cells get insertText: A, B, C, D
      const insertTexts = requests.filter((r) => r.insertText);
      expect(insertTexts).toHaveLength(4);
    });
  });

  describe('cell index math', () => {
    // For a 2x2 table at T=1, numCols=2:
    //   baseCellIndex(1, r, c, 2) = 1 + 4 + r * (1 + 4) + 2*c = 5 + 5r + 2c
    //   cell(0,0) base = 5, cell(0,1) base = 7
    //   cell(1,0) base = 10, cell(1,1) base = 12

    it('should insert text at correct indices for a 2x2 table', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['A', 'B'],
          ['C', 'D'],
        ],
        1,
        false
      );

      const insertTexts = requests.filter((r) => r.insertText);
      expect(insertTexts).toHaveLength(4);

      // cell(0,0): base=5, cumulative=0 → index=5
      expect(insertTexts[0].insertText!.text).toBe('A');
      expect(insertTexts[0].insertText!.location!.index).toBe(5);

      // cell(0,1): base=7, cumulative=1 (len of "A") → index=8
      expect(insertTexts[1].insertText!.text).toBe('B');
      expect(insertTexts[1].insertText!.location!.index).toBe(8);

      // cell(1,0): base=10, cumulative=2 (len of "A"+"B") → index=12
      expect(insertTexts[2].insertText!.text).toBe('C');
      expect(insertTexts[2].insertText!.location!.index).toBe(12);

      // cell(1,1): base=12, cumulative=3 (len of "A"+"B"+"C") → index=15
      expect(insertTexts[3].insertText!.text).toBe('D');
      expect(insertTexts[3].insertText!.location!.index).toBe(15);
    });

    it('should handle multi-character cell text correctly', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['Hello', 'World'],
          ['Foo', 'Bar'],
        ],
        1,
        false
      );

      const insertTexts = requests.filter((r) => r.insertText);

      // cell(0,0): base=5, cumulative=0 → 5
      expect(insertTexts[0].insertText!.location!.index).toBe(5);

      // cell(0,1): base=7, cumulative=5 ("Hello") → 12
      expect(insertTexts[1].insertText!.location!.index).toBe(12);

      // cell(1,0): base=10, cumulative=10 ("Hello"+"World") → 20
      expect(insertTexts[2].insertText!.location!.index).toBe(20);

      // cell(1,1): base=12, cumulative=13 ("Hello"+"World"+"Foo") → 25
      expect(insertTexts[3].insertText!.location!.index).toBe(25);
    });

    it('should work with a different starting index', () => {
      const requests = buildInsertTableWithDataRequests([['X']], 50, false);

      const tableReq = requests.find((r) => r.insertTable);
      expect(tableReq!.insertTable!.location!.index).toBe(50);

      const insertTexts = requests.filter((r) => r.insertText);
      // cell(0,0): 50 + 4 + 0 + 0 = 54
      expect(insertTexts[0].insertText!.location!.index).toBe(54);
    });

    it('should handle a 3x3 table correctly', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['a', 'b', 'c'],
          ['d', 'e', 'f'],
          ['g', 'h', 'i'],
        ],
        1,
        false
      );

      const insertTexts = requests.filter((r) => r.insertText);
      expect(insertTexts).toHaveLength(9);

      // For 3x3 at T=1: baseCellIndex = 1 + 4 + r*(1+6) + 2c = 5 + 7r + 2c
      // row 0: bases = 5, 7, 9
      // row 1: bases = 12, 14, 16
      // row 2: bases = 19, 21, 23

      // cell(0,0): base=5, cum=0 → 5
      expect(insertTexts[0].insertText!.location!.index).toBe(5);
      // cell(0,1): base=7, cum=1 → 8
      expect(insertTexts[1].insertText!.location!.index).toBe(8);
      // cell(0,2): base=9, cum=2 → 11
      expect(insertTexts[2].insertText!.location!.index).toBe(11);
      // cell(1,0): base=12, cum=3 → 15
      expect(insertTexts[3].insertText!.location!.index).toBe(15);
      // cell(1,1): base=14, cum=4 → 18
      expect(insertTexts[4].insertText!.location!.index).toBe(18);
      // cell(1,2): base=16, cum=5 → 21
      expect(insertTexts[5].insertText!.location!.index).toBe(21);
      // cell(2,0): base=19, cum=6 → 25
      expect(insertTexts[6].insertText!.location!.index).toBe(25);
      // cell(2,1): base=21, cum=7 → 28
      expect(insertTexts[7].insertText!.location!.index).toBe(28);
      // cell(2,2): base=23, cum=8 → 31
      expect(insertTexts[8].insertText!.location!.index).toBe(31);
    });
  });

  describe('empty cells', () => {
    it('should skip insertText for empty string cells', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['A', ''],
          ['', 'D'],
        ],
        1,
        false
      );

      const insertTexts = requests.filter((r) => r.insertText);
      expect(insertTexts).toHaveLength(2);
      expect(insertTexts[0].insertText!.text).toBe('A');
      expect(insertTexts[1].insertText!.text).toBe('D');
    });

    it('should compute correct indices when cells are skipped', () => {
      // 2x2 at T=1, but cell(0,1) is empty
      const requests = buildInsertTableWithDataRequests(
        [
          ['A', ''],
          ['C', 'D'],
        ],
        1,
        false
      );

      const insertTexts = requests.filter((r) => r.insertText);
      expect(insertTexts).toHaveLength(3);

      // cell(0,0): base=5, cum=0 → 5
      expect(insertTexts[0].insertText!.location!.index).toBe(5);
      // cell(0,1) skipped
      // cell(1,0): base=10, cum=1 ("A") → 11
      expect(insertTexts[1].insertText!.location!.index).toBe(11);
      // cell(1,1): base=12, cum=2 ("A"+"C") → 14
      expect(insertTexts[2].insertText!.location!.index).toBe(14);
    });
  });

  describe('header row bolding', () => {
    it('should add updateTextStyle requests for header cells when hasHeaderRow=true', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['Name', 'Age'],
          ['Alice', '30'],
        ],
        1,
        true
      );

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      expect(styleReqs).toHaveLength(2);

      // "Name" bold: range starts at 5 (base for cell(0,0), cum=0), ends at 5+4=9
      expect(styleReqs[0].updateTextStyle!.textStyle!.bold).toBe(true);
      expect(styleReqs[0].updateTextStyle!.range!.startIndex).toBe(5);
      expect(styleReqs[0].updateTextStyle!.range!.endIndex).toBe(9);

      // "Age" bold: base for cell(0,1)=7, cum=4 ("Name") → 11, ends at 11+3=14
      expect(styleReqs[1].updateTextStyle!.textStyle!.bold).toBe(true);
      expect(styleReqs[1].updateTextStyle!.range!.startIndex).toBe(11);
      expect(styleReqs[1].updateTextStyle!.range!.endIndex).toBe(14);
    });

    it('should not add style requests when hasHeaderRow=false', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['Name', 'Age'],
          ['Alice', '30'],
        ],
        1,
        false
      );

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      expect(styleReqs).toHaveLength(0);
    });

    it('should not bold empty header cells', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['Name', ''],
          ['Alice', '30'],
        ],
        1,
        true
      );

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      expect(styleReqs).toHaveLength(1);
      expect(styleReqs[0].updateTextStyle!.range!.startIndex).toBe(5);
    });

    it('should not bold non-header rows', () => {
      const requests = buildInsertTableWithDataRequests(
        [
          ['H1', 'H2'],
          ['A', 'B'],
          ['C', 'D'],
        ],
        1,
        true
      );

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      // Only 2 bold requests (for H1 and H2), not for A, B, C, D
      expect(styleReqs).toHaveLength(2);
    });
  });

  describe('tabId propagation', () => {
    it('should include tabId in all request locations when provided', () => {
      const tabId = 'tab123';
      const requests = buildInsertTableWithDataRequests(
        [
          ['A', 'B'],
          ['C', 'D'],
        ],
        1,
        true,
        tabId
      );

      const tableReq = requests.find((r) => r.insertTable);
      expect((tableReq!.insertTable!.location as any).tabId).toBe(tabId);

      const insertTexts = requests.filter((r) => r.insertText);
      for (const req of insertTexts) {
        expect((req.insertText!.location as any).tabId).toBe(tabId);
      }

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      for (const req of styleReqs) {
        expect(req.updateTextStyle!.range!.tabId).toBe(tabId);
      }
    });

    it('should not include tabId when not provided', () => {
      const requests = buildInsertTableWithDataRequests([['A']], 1, false);

      const tableReq = requests.find((r) => r.insertTable);
      expect((tableReq!.insertTable!.location as any).tabId).toBeUndefined();

      const insertTexts = requests.filter((r) => r.insertText);
      expect((insertTexts[0].insertText!.location as any).tabId).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw on empty data array', () => {
      expect(() => buildInsertTableWithDataRequests([], 1, false)).toThrow();
    });

    it('should throw on data with only empty rows', () => {
      expect(() => buildInsertTableWithDataRequests([[]], 1, false)).toThrow();
    });
  });
});
