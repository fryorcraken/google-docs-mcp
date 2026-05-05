import { describe, it, expect } from 'vitest';
import { convertMarkdownToRequests } from './markdownToDocs.js';
import { docsJsonToMarkdown } from './docsToMarkdown.js';

// ============================================================
// Markdown -> Google Docs Requests
// ============================================================

describe('Markdown to Docs Conversion', () => {
  describe('Basic Text Formatting', () => {
    it('should convert bold text', () => {
      const requests = convertMarkdownToRequests('**bold text**', 1);

      const insertReq = requests.find((r) => r.insertText);
      expect(insertReq).toBeDefined();
      expect(insertReq!.insertText!.text).toBe('bold text');

      const styleReq = requests.find((r) => r.updateTextStyle);
      expect(styleReq).toBeDefined();
      expect(styleReq!.updateTextStyle!.textStyle!.bold).toBe(true);
    });

    it('should convert italic text', () => {
      const requests = convertMarkdownToRequests('*italic text*', 1);

      const styleReq = requests.find((r) => r.updateTextStyle);
      expect(styleReq).toBeDefined();
      expect(styleReq!.updateTextStyle!.textStyle!.italic).toBe(true);
    });

    it('should convert strikethrough text', () => {
      const requests = convertMarkdownToRequests('~~strikethrough text~~', 1);

      const styleReq = requests.find((r) => r.updateTextStyle);
      expect(styleReq).toBeDefined();
      expect(styleReq!.updateTextStyle!.textStyle!.strikethrough).toBe(true);
    });

    it('should convert nested bold and italic', () => {
      const requests = convertMarkdownToRequests('***bold italic***', 1);

      const styleReq = requests.find((r) => r.updateTextStyle);
      expect(styleReq).toBeDefined();
      expect(styleReq!.updateTextStyle!.textStyle!.bold).toBe(true);
      expect(styleReq!.updateTextStyle!.textStyle!.italic).toBe(true);
    });

    it('should style inline code as monospace', () => {
      const requests = convertMarkdownToRequests('Use `inline_code` here', 1);

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      const codeStyleReq = styleReqs.find(
        (r) => r.updateTextStyle!.textStyle!.weightedFontFamily?.fontFamily === 'Roboto Mono'
      );
      expect(codeStyleReq).toBeDefined();
    });
  });

  describe('Links', () => {
    it('should convert basic links', () => {
      const requests = convertMarkdownToRequests('[link text](https://example.com)', 1);

      const insertReq = requests.find((r) => r.insertText);
      expect(insertReq).toBeDefined();
      expect(insertReq!.insertText!.text).toBe('link text');

      const styleReq = requests.find((r) => r.updateTextStyle);
      expect(styleReq).toBeDefined();
      expect(styleReq!.updateTextStyle!.textStyle!.link!.url).toBe('https://example.com');
    });
  });

  describe('Headings', () => {
    it('should convert H1', () => {
      const requests = convertMarkdownToRequests('# Heading 1', 1);

      const insertReq = requests.find((r) => r.insertText && r.insertText.text === 'Heading 1');
      expect(insertReq).toBeDefined();

      const paraReq = requests.find((r) => r.updateParagraphStyle);
      expect(paraReq).toBeDefined();
      expect(paraReq!.updateParagraphStyle!.paragraphStyle!.namedStyleType).toBe('HEADING_1');
    });

    it('should convert H2', () => {
      const requests = convertMarkdownToRequests('## Heading 2', 1);

      const paraReq = requests.find((r) => r.updateParagraphStyle);
      expect(paraReq).toBeDefined();
      expect(paraReq!.updateParagraphStyle!.paragraphStyle!.namedStyleType).toBe('HEADING_2');
    });

    it('should convert H3', () => {
      const requests = convertMarkdownToRequests('### Heading 3', 1);

      const paraReq = requests.find((r) => r.updateParagraphStyle);
      expect(paraReq).toBeDefined();
      expect(paraReq!.updateParagraphStyle!.paragraphStyle!.namedStyleType).toBe('HEADING_3');
    });
  });

  describe('firstHeadingAsTitle option', () => {
    it('should style the first H1 as TITLE when enabled', () => {
      const requests = convertMarkdownToRequests(
        '# My Document Title\n\nSome body text.',
        1,
        undefined,
        {
          firstHeadingAsTitle: true,
        }
      );

      const paraReqs = requests.filter((r) => r.updateParagraphStyle);
      const titleReq = paraReqs.find(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'TITLE'
      );
      expect(titleReq).toBeDefined();

      // Should NOT have a HEADING_1
      const h1Req = paraReqs.find(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'HEADING_1'
      );
      expect(h1Req).toBeUndefined();
    });

    it('should only convert the first H1 to TITLE, not subsequent H1s', () => {
      const markdown = '# Title\n\n# Second H1\n\nSome text.';
      const requests = convertMarkdownToRequests(markdown, 1, undefined, {
        firstHeadingAsTitle: true,
      });

      const paraReqs = requests.filter((r) => r.updateParagraphStyle);
      const titleReqs = paraReqs.filter(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'TITLE'
      );
      const h1Reqs = paraReqs.filter(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'HEADING_1'
      );

      expect(titleReqs).toHaveLength(1);
      expect(h1Reqs).toHaveLength(1);
    });

    it('should leave H1 as HEADING_1 when option is disabled (default)', () => {
      const requests = convertMarkdownToRequests('# Heading 1', 1);

      const paraReq = requests.find((r) => r.updateParagraphStyle);
      expect(paraReq).toBeDefined();
      expect(paraReq!.updateParagraphStyle!.paragraphStyle!.namedStyleType).toBe('HEADING_1');
    });

    it('should not affect H2+ headings when enabled', () => {
      const markdown = '## Section\n\n### Subsection';
      const requests = convertMarkdownToRequests(markdown, 1, undefined, {
        firstHeadingAsTitle: true,
      });

      const paraReqs = requests.filter((r) => r.updateParagraphStyle);
      const titleReqs = paraReqs.filter(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'TITLE'
      );
      expect(titleReqs).toHaveLength(0);

      const h2 = paraReqs.find(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'HEADING_2'
      );
      const h3 = paraReqs.find(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'HEADING_3'
      );
      expect(h2).toBeDefined();
      expect(h3).toBeDefined();
    });

    it('should handle a full document with title, headings, and lists', () => {
      const markdown = [
        '# Project Plan',
        '',
        '## Overview',
        '',
        'This is the overview.',
        '',
        '## Tasks',
        '',
        '- Task 1',
        '- Task 2',
      ].join('\n');

      const requests = convertMarkdownToRequests(markdown, 1, undefined, {
        firstHeadingAsTitle: true,
      });

      const paraReqs = requests.filter((r) => r.updateParagraphStyle);
      const titleReqs = paraReqs.filter(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'TITLE'
      );
      const h2Reqs = paraReqs.filter(
        (r) => r.updateParagraphStyle!.paragraphStyle!.namedStyleType === 'HEADING_2'
      );

      expect(titleReqs).toHaveLength(1);
      expect(h2Reqs).toHaveLength(2);
    });
  });

  describe('Lists', () => {
    it('should convert bullet lists', () => {
      const requests = convertMarkdownToRequests('- Item 1\n- Item 2\n- Item 3', 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      expect(bulletReqs).toHaveLength(1);
      expect(bulletReqs[0].createParagraphBullets!.bulletPreset).toBe('BULLET_DISC_CIRCLE_SQUARE');
    });

    it('should convert numbered lists', () => {
      const requests = convertMarkdownToRequests('1. Item 1\n2. Item 2\n3. Item 3', 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      expect(bulletReqs).toHaveLength(1);
      expect(bulletReqs[0].createParagraphBullets!.bulletPreset).toBe(
        'NUMBERED_DECIMAL_ALPHA_ROMAN'
      );
    });

    it('should preserve nested list levels with leading tabs', () => {
      const requests = convertMarkdownToRequests('- Parent\n  - Child', 1);

      const insertReqs = requests.filter((r) => r.insertText);
      expect(insertReqs.some((r) => r.insertText!.text!.includes('Parent'))).toBe(true);
      expect(insertReqs.some((r) => r.insertText!.text === '\t')).toBe(true);
      expect(insertReqs.some((r) => r.insertText!.text!.includes('Child'))).toBe(true);
    });

    it('should insert multiple tabs for deeply nested lists (3 levels)', () => {
      const markdown = '- Level 0\n  - Level 1\n    - Level 2';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReqs = requests.filter((r) => r.insertText);
      // Level 0 has no tab, Level 1 has 1 tab, Level 2 has 2 tabs
      expect(insertReqs.some((r) => r.insertText!.text === '\t\t')).toBe(true);
      expect(insertReqs.some((r) => r.insertText!.text!.includes('Level 2'))).toBe(true);
    });

    it('should use ordered preset for nested ordered list inside bullets', () => {
      const markdown = '- Bullet parent\n  1. Ordered child 1\n  2. Ordered child 2';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      const presets = bulletReqs.map((r) => r.createParagraphBullets!.bulletPreset);
      expect(presets).toContain('BULLET_DISC_CIRCLE_SQUARE');
      expect(presets).toContain('NUMBERED_DECIMAL_ALPHA_ROMAN');
    });

    it('should use bullet preset for nested bullets inside ordered list', () => {
      const markdown = '1. Ordered parent\n  - Bullet child 1\n  - Bullet child 2';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      const presets = bulletReqs.map((r) => r.createParagraphBullets!.bulletPreset);
      expect(presets).toContain('NUMBERED_DECIMAL_ALPHA_ROMAN');
      expect(presets).toContain('BULLET_DISC_CIRCLE_SQUARE');
    });

    it('should produce separate bullet requests for mixed nested list types', () => {
      const markdown = '- Parent\n  1. Child\n- Parent 2';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      // Bullet and ordered are different presets so they cannot merge
      expect(bulletReqs.length).toBeGreaterThanOrEqual(2);
    });

    it('should merge sibling items of the same type even around nested sub-lists', () => {
      // Both "Parent 1" and "Parent 2" are BULLET_DISC_CIRCLE_SQUARE at level 0.
      // The ordered sub-list between them is a different preset.
      const markdown = '- Parent 1\n  1. Ordered child\n- Parent 2';
      const requests = convertMarkdownToRequests(markdown, 1);

      const allText = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText!.text)
        .join('');
      expect(allText).toContain('Parent 1');
      expect(allText).toContain('Ordered child');
      expect(allText).toContain('Parent 2');
    });

    it('should convert markdown task lists to checkbox bullets', () => {
      const requests = convertMarkdownToRequests('- [x] done\n- [ ] todo', 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      expect(bulletReqs).toHaveLength(1);
      expect(bulletReqs[0].createParagraphBullets!.bulletPreset).toBe('BULLET_CHECKBOX');

      const allInsertedText = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText!.text)
        .join('');
      expect(allInsertedText).not.toContain('[x]');
      expect(allInsertedText).not.toContain('[ ]');
    });

    it('should not let list bullet ranges bleed into following headings', () => {
      const requests = convertMarkdownToRequests('- Parent\n  1. Child\n\n## Next Heading', 1);

      const headingReq = requests.find(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2'
      );
      expect(headingReq).toBeDefined();
      const headingStart = headingReq!.updateParagraphStyle!.range!.startIndex!;

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      const overlappingBullet = bulletReqs.find((r) => {
        const { startIndex, endIndex } = r.createParagraphBullets!.range!;
        return headingStart >= startIndex! && headingStart < endIndex!;
      });
      expect(overlappingBullet).toBeUndefined();
    });

    it('should not merge separate bullet lists with content between them', () => {
      const markdown = [
        '**Part 1: The Question**',
        '- Item A',
        '- Item B',
        '',
        '**Part 2: The Results**',
        '- Item C',
        '- Item D',
      ].join('\n');

      const requests = convertMarkdownToRequests(markdown, 1);
      const bulletReqs = requests.filter((r) => r.createParagraphBullets);

      // Should produce two separate bullet ranges, not one merged range
      expect(bulletReqs).toHaveLength(2);

      // The paragraph "Part 2: The Results" must not fall inside any bullet range
      const insertReqs = requests.filter((r) => r.insertText);
      let part2Index: number | undefined;
      for (const r of insertReqs) {
        if (r.insertText!.text!.includes('Part 2')) {
          part2Index = r.insertText!.location!.index!;
          break;
        }
      }
      expect(part2Index).toBeDefined();

      for (const b of bulletReqs) {
        const { startIndex, endIndex } = b.createParagraphBullets!.range!;
        const inside = part2Index! >= startIndex! && part2Index! < endIndex!;
        expect(inside).toBe(false);
      }
    });

    it('should keep adjacent items in the same list merged', () => {
      const requests = convertMarkdownToRequests('- A\n- B\n- C', 1);
      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      expect(bulletReqs).toHaveLength(1);
    });
  });

  describe('Code Blocks', () => {
    it('should insert a 1x1 table for fenced code blocks', () => {
      const requests = convertMarkdownToRequests('```js\nconst x = 1;\nconsole.log(x);\n```', 1);

      // Should have an insertTable request
      const tableReqs = requests.filter((r) => r.insertTable);
      expect(tableReqs).toHaveLength(1);
      expect(tableReqs[0].insertTable!.rows).toBe(1);
      expect(tableReqs[0].insertTable!.columns).toBe(1);
    });

    it('should insert code text into the table cell', () => {
      const requests = convertMarkdownToRequests('```\nhello world\n```', 1);

      const insertReqs = requests.filter((r) => r.insertText);
      expect(insertReqs.some((r) => r.insertText!.text!.includes('hello world'))).toBe(true);
    });

    it('should style code block text as monospace', () => {
      const requests = convertMarkdownToRequests('```\nconst x = 1;\nconsole.log(x);\n```', 1);

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      const monospaceReqs = styleReqs.filter(
        (r) => r.updateTextStyle!.textStyle!.weightedFontFamily?.fontFamily === 'Roboto Mono'
      );
      expect(monospaceReqs).toHaveLength(1);
    });

    it('should style the table cell with background color', () => {
      const requests = convertMarkdownToRequests('```\ncode\n```', 1);

      const cellStyleReqs = requests.filter((r) => r.updateTableCellStyle);
      expect(cellStyleReqs).toHaveLength(1);

      const cellStyle = cellStyleReqs[0].updateTableCellStyle!.tableCellStyle!;
      expect(cellStyle.backgroundColor).toBeDefined();
      expect(cellStyle.paddingTop).toBeDefined();
      expect(cellStyle.paddingBottom).toBeDefined();
      expect(cellStyle.paddingLeft).toBeDefined();
      expect(cellStyle.paddingRight).toBeDefined();
    });

    it('should reference the actual table start (insertTable index + 1) in updateTableCellStyle', () => {
      // insertTable auto-inserts a preceding newline at T, so the table element
      // starts at T+1. The updateTableCellStyle must reference T+1, not T.
      const requests = convertMarkdownToRequests('```\ncode\n```', 1);

      const tableReq = requests.find((r) => r.insertTable);
      const cellStyleReq = requests.find((r) => r.updateTableCellStyle);

      expect(tableReq).toBeDefined();
      expect(cellStyleReq).toBeDefined();

      const insertTableIndex = tableReq!.insertTable!.location!.index!;
      const tableStartLocationIndex =
        cellStyleReq!.updateTableCellStyle!.tableRange!.tableCellLocation!.tableStartLocation!
          .index!;

      // The actual table start is insertTable target + 1 (preceding newline shifts it)
      expect(tableStartLocationIndex).toBe(insertTableIndex + 1);
    });

    it('should insert code text at correct offset from table start', () => {
      const requests = convertMarkdownToRequests('```\nhello\n```', 1);

      const tableReq = requests.find((r) => r.insertTable);
      const codeInsertReq = requests.find((r) => r.insertText && r.insertText.text === 'hello');

      expect(tableReq).toBeDefined();
      expect(codeInsertReq).toBeDefined();

      const tableIndex = tableReq!.insertTable!.location!.index!;
      const textIndex = codeInsertReq!.insertText!.location!.index!;

      // Cell content should be at table start + 4 (CELL_CONTENT_OFFSET)
      expect(textIndex).toBe(tableIndex + 4);
    });

    it('should handle multi-line code blocks', () => {
      const requests = convertMarkdownToRequests('```\nline1\nline2\nline3\n```', 1);

      const insertReqs = requests.filter((r) => r.insertText);
      const codeContent = insertReqs.find((r) => r.insertText!.text === 'line1\nline2\nline3');
      expect(codeContent).toBeDefined();
    });

    it('should handle empty code blocks', () => {
      const requests = convertMarkdownToRequests('```\n```', 1);

      const tableReqs = requests.filter((r) => r.insertTable);
      expect(tableReqs).toHaveLength(1);

      // No code text insertion (empty block)
      const codeInsertReqs = requests.filter((r) => r.insertText && r.insertText.text !== '\n');
      expect(codeInsertReqs).toHaveLength(0);
    });

    it('should handle multiple code blocks in sequence', () => {
      const markdown = '```\ncode1\n```\n\n```\ncode2\n```';
      const requests = convertMarkdownToRequests(markdown, 1);

      const tableReqs = requests.filter((r) => r.insertTable);
      expect(tableReqs).toHaveLength(2);

      const cellStyleReqs = requests.filter((r) => r.updateTableCellStyle);
      expect(cellStyleReqs).toHaveLength(2);
    });

    it('should include tabId in table, text, and cell style requests when provided', () => {
      const requests = convertMarkdownToRequests('```\ncode\n```', 1, 'tab-code');

      const tableReq = requests.find((r) => r.insertTable);
      expect(tableReq!.insertTable!.location!.tabId).toBe('tab-code');

      const codeInsertReq = requests.find((r) => r.insertText && r.insertText.text === 'code');
      expect(codeInsertReq!.insertText!.location!.tabId).toBe('tab-code');

      const cellStyleReq = requests.find((r) => r.updateTableCellStyle);
      expect(
        cellStyleReq!.updateTableCellStyle!.tableRange!.tableCellLocation!.tableStartLocation!.tabId
      ).toBe('tab-code');
    });

    it('should not affect inline code styling', () => {
      const requests = convertMarkdownToRequests('Use `inline_code` here', 1);

      // Inline code should NOT create a table
      const tableReqs = requests.filter((r) => r.insertTable);
      expect(tableReqs).toHaveLength(0);

      // Inline code should still use text styling (monospace + green + background)
      const styleReqs = requests.filter((r) => r.updateTextStyle);
      const codeStyleReq = styleReqs.find(
        (r) => r.updateTextStyle!.textStyle!.weightedFontFamily?.fontFamily === 'Roboto Mono'
      );
      expect(codeStyleReq).toBeDefined();
    });

    it('should correctly track indices after a code block for following content', () => {
      const markdown = '```\ncode\n```\n\nFollowing text.';
      const requests = convertMarkdownToRequests(markdown, 1);

      // The following text should have valid insert locations
      const followingInsert = requests.find(
        (r) => r.insertText && r.insertText.text!.includes('Following text')
      );
      expect(followingInsert).toBeDefined();
      expect(followingInsert!.insertText!.location!.index).toBeGreaterThan(1);
    });
  });

  describe('Mixed Content', () => {
    it('should convert document with multiple elements', () => {
      const markdown = `# Title

This is **bold** and *italic* text with a [link](https://example.com).

- List item 1
- List item 2

## Heading 2

More content.`;

      const requests = convertMarkdownToRequests(markdown, 1);

      expect(requests.some((r) => r.insertText)).toBe(true);
      expect(requests.some((r) => r.updateTextStyle)).toBe(true);
      expect(requests.some((r) => r.updateParagraphStyle)).toBe(true);
      expect(requests.some((r) => r.createParagraphBullets)).toBe(true);

      expect(
        requests.find((r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_1')
      ).toBeDefined();

      expect(
        requests.find((r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2')
      ).toBeDefined();
    });
  });

  describe('Index Tracking', () => {
    it('should use correct start index', () => {
      const requests = convertMarkdownToRequests('Test text', 100);

      const insertReq = requests.find((r) => r.insertText);
      expect(insertReq).toBeDefined();
      expect(insertReq!.insertText!.location!.index).toBe(100);
    });

    it('should track indices for sequential inserts', () => {
      const requests = convertMarkdownToRequests('First paragraph.\n\nSecond paragraph.', 1);

      const insertReqs = requests.filter((r) => r.insertText);
      expect(insertReqs.length).toBeGreaterThan(0);

      for (const req of insertReqs) {
        expect(req.insertText!.location).toBeDefined();
        expect(typeof req.insertText!.location!.index).toBe('number');
      }
    });
  });

  describe('Tab Support', () => {
    it('should include tabId in requests when provided', () => {
      const requests = convertMarkdownToRequests('**bold text**', 1, 'tab123');

      const insertReq = requests.find((r) => r.insertText);
      expect(insertReq).toBeDefined();
      expect(insertReq!.insertText!.location!.tabId).toBe('tab123');

      const styleReq = requests.find((r) => r.updateTextStyle);
      expect(styleReq).toBeDefined();
      expect(styleReq!.updateTextStyle!.range!.tabId).toBe('tab123');
    });
  });

  describe('Paragraph Spacing', () => {
    it('should apply spaceBelow to normal text paragraphs', () => {
      const requests = convertMarkdownToRequests('First paragraph.\n\nSecond paragraph.', 1);

      const spacingReqs = requests.filter(
        (r) =>
          r.updateParagraphStyle?.paragraphStyle?.spaceBelow &&
          !r.updateParagraphStyle?.paragraphStyle?.namedStyleType &&
          !r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      expect(spacingReqs).toHaveLength(2);

      for (const req of spacingReqs) {
        expect(req.updateParagraphStyle!.paragraphStyle!.spaceBelow!.magnitude).toBe(8);
        expect(req.updateParagraphStyle!.paragraphStyle!.spaceBelow!.unit).toBe('PT');
        expect(req.updateParagraphStyle!.fields).toBe('spaceBelow');
      }
    });

    it('should only apply spaceBelow to the last item of a list, not every item', () => {
      const requests = convertMarkdownToRequests('- Item 1\n- Item 2\n- Item 3', 1);

      const spacingReqs = requests.filter(
        (r) =>
          r.updateParagraphStyle?.paragraphStyle?.spaceBelow &&
          !r.updateParagraphStyle?.paragraphStyle?.namedStyleType &&
          !r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      // Only 1 spacing request: the trailing spacing on the last list item
      expect(spacingReqs).toHaveLength(1);
    });

    it('should not apply spaceBelow to headings (they have named styles)', () => {
      const requests = convertMarkdownToRequests('# Heading\n\n## Subheading', 1);

      const spacingReqs = requests.filter(
        (r) =>
          r.updateParagraphStyle?.paragraphStyle?.spaceBelow &&
          !r.updateParagraphStyle?.paragraphStyle?.namedStyleType &&
          !r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      expect(spacingReqs).toHaveLength(0);
    });

    it('should apply spaceBelow to normal paragraphs and last list items in mixed content', () => {
      const markdown = '# Title\n\nA paragraph.\n\n- List item\n\nAnother paragraph.';
      const requests = convertMarkdownToRequests(markdown, 1);

      const spacingReqs = requests.filter(
        (r) =>
          r.updateParagraphStyle?.paragraphStyle?.spaceBelow &&
          !r.updateParagraphStyle?.paragraphStyle?.namedStyleType &&
          !r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      // "A paragraph." + "Another paragraph." + last list item trailing spacing = 3
      expect(spacingReqs).toHaveLength(3);
    });

    it('should include tabId in spacing requests when provided', () => {
      const requests = convertMarkdownToRequests('A paragraph.', 1, 'tab-xyz');

      const spacingReqs = requests.filter(
        (r) =>
          r.updateParagraphStyle?.paragraphStyle?.spaceBelow &&
          !r.updateParagraphStyle?.paragraphStyle?.namedStyleType
      );
      expect(spacingReqs).toHaveLength(1);
      expect(spacingReqs[0].updateParagraphStyle!.range!.tabId).toBe('tab-xyz');
    });
  });

  describe('List Trailing Spacing', () => {
    // Helper to find spacing requests that target list items (not normal paragraphs or headings).
    // We identify them by checking they don't overlap with normalParagraph spacing ranges or
    // heading styles. Instead we just verify the total spaceBelow count vs paragraph-only count.
    function getListSpacingReqs(requests: ReturnType<typeof convertMarkdownToRequests>) {
      // All spaceBelow requests that are NOT heading styles and NOT border styles
      return requests.filter(
        (r) =>
          r.updateParagraphStyle?.paragraphStyle?.spaceBelow &&
          !r.updateParagraphStyle?.paragraphStyle?.namedStyleType &&
          !r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
    }

    it('should apply spaceBelow to the last item of a bullet list', () => {
      const requests = convertMarkdownToRequests('- Item 1\n- Item 2\n- Item 3', 1);

      const spacingReqs = getListSpacingReqs(requests);
      // 1 request for the last list item (no normal paragraphs here)
      expect(spacingReqs).toHaveLength(1);
      expect(spacingReqs[0].updateParagraphStyle!.paragraphStyle!.spaceBelow!.magnitude).toBe(8);
    });

    it('should apply spaceBelow to the last item of an ordered list', () => {
      const requests = convertMarkdownToRequests('1. First\n2. Second\n3. Third', 1);

      const spacingReqs = getListSpacingReqs(requests);
      expect(spacingReqs).toHaveLength(1);
      expect(spacingReqs[0].updateParagraphStyle!.paragraphStyle!.spaceBelow!.magnitude).toBe(8);
    });

    it('should apply spaceBelow after each separate list in the document', () => {
      const markdown = '- A\n- B\n\nSome text.\n\n1. One\n2. Two';
      const requests = convertMarkdownToRequests(markdown, 1);

      const spacingReqs = getListSpacingReqs(requests);
      // 2 list-trailing spacing + 1 normal paragraph spacing = 3 total
      expect(spacingReqs).toHaveLength(3);
    });

    it('should create spacing between a list and the following paragraph', () => {
      const markdown = '- Item 1\n- Item 2\n\nFollowing paragraph.';
      const requests = convertMarkdownToRequests(markdown, 1);

      const spacingReqs = getListSpacingReqs(requests);
      // 1 for last list item + 1 for the following paragraph = 2
      expect(spacingReqs).toHaveLength(2);
    });

    it('should handle nested lists and apply spacing after the top-level list', () => {
      const markdown = '- Parent\n  - Child 1\n  - Child 2\n\nAfter the list.';
      const requests = convertMarkdownToRequests(markdown, 1);

      const spacingReqs = getListSpacingReqs(requests);
      // 1 for last item of the top-level list + 1 for the following paragraph = 2
      expect(spacingReqs).toHaveLength(2);
    });

    it('should include tabId in list spacing requests when provided', () => {
      const requests = convertMarkdownToRequests('- Item 1\n- Item 2', 1, 'tab-list');

      const spacingReqs = getListSpacingReqs(requests);
      expect(spacingReqs).toHaveLength(1);
      expect(spacingReqs[0].updateParagraphStyle!.range!.tabId).toBe('tab-list');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty markdown', () => {
      expect(convertMarkdownToRequests('', 1)).toHaveLength(0);
    });

    it('should handle whitespace-only markdown', () => {
      expect(convertMarkdownToRequests('   \n\n   ', 1)).toHaveLength(0);
    });

    it('should handle plain text without formatting', () => {
      const requests = convertMarkdownToRequests('Just plain text', 1);

      const insertReq = requests.find((r) => r.insertText);
      expect(insertReq).toBeDefined();
      expect(insertReq!.insertText!.text).toBe('Just plain text');

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      expect(styleReqs).toHaveLength(0);
    });
  });

  describe('Horizontal Rules', () => {
    it('should produce a border-bottom paragraph style for ---', () => {
      const requests = convertMarkdownToRequests('Above\n\n---\n\nBelow', 1);

      const hrReqs = requests.filter((r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom);
      expect(hrReqs).toHaveLength(1);

      const border = hrReqs[0].updateParagraphStyle!.paragraphStyle!.borderBottom!;
      expect(border.dashStyle).toBe('SOLID');
      expect(border.width!.magnitude).toBe(1);
      expect(border.width!.unit).toBe('PT');
    });

    it('should handle multiple horizontal rules', () => {
      const requests = convertMarkdownToRequests(
        '# Title\n\n---\n\n## S1\n\nText.\n\n---\n\n## S2',
        1
      );

      const hrReqs = requests.filter((r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom);
      expect(hrReqs).toHaveLength(2);
    });

    it('should not drop surrounding content', () => {
      const requests = convertMarkdownToRequests('Above\n\n---\n\nBelow', 1);

      const allText = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText!.text)
        .join('');

      expect(allText).toContain('Above');
      expect(allText).toContain('Below');
    });

    it('should place the HR paragraph between surrounding content', () => {
      const requests = convertMarkdownToRequests('Above\n\n---\n\nBelow', 1);

      const hrReqs = requests.filter((r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom);
      expect(hrReqs).toHaveLength(1);

      const hrStart = hrReqs[0].updateParagraphStyle!.range!.startIndex!;
      const hrEnd = hrReqs[0].updateParagraphStyle!.range!.endIndex!;

      const aboveInsert = requests.find(
        (r) => r.insertText && r.insertText.text!.includes('Above')
      );
      const belowInsert = requests.find(
        (r) => r.insertText && r.insertText.text!.includes('Below')
      );

      expect(aboveInsert!.insertText!.location!.index).toBeLessThan(hrStart);
      expect(belowInsert!.insertText!.location!.index).toBeGreaterThanOrEqual(hrEnd);
    });

    it('should include tabId on HR border requests when provided', () => {
      const requests = convertMarkdownToRequests('---', 1, 'tab-abc');

      const hrReqs = requests.filter((r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom);
      expect(hrReqs.length).toBeGreaterThan(0);
      expect(hrReqs[0].updateParagraphStyle!.range!.tabId).toBe('tab-abc');
    });

    it('should work in a realistic document with headings, lists, and rules', () => {
      const markdown = `# Project Plan

---

## Goals

- **Speed:** Ship faster
- **Quality:** Fewer bugs

## Timeline

1. Planning
2. Execution
3. Review

---

*Last updated: 2026*`;

      const requests = convertMarkdownToRequests(markdown, 1);

      // HRs
      const hrReqs = requests.filter((r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom);
      expect(hrReqs).toHaveLength(2);

      // Headings
      const h1Reqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_1'
      );
      const h2Reqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2'
      );
      expect(h1Reqs).toHaveLength(1);
      expect(h2Reqs).toHaveLength(2);

      // Bullet lists (merged into one range)
      const bulletReqs = requests.filter(
        (r) => r.createParagraphBullets?.bulletPreset === 'BULLET_DISC_CIRCLE_SQUARE'
      );
      expect(bulletReqs).toHaveLength(1);

      // Numbered list (merged into one range)
      const numberedReqs = requests.filter(
        (r) => r.createParagraphBullets?.bulletPreset === 'NUMBERED_DECIMAL_ALPHA_ROMAN'
      );
      expect(numberedReqs).toHaveLength(1);

      // Bold
      const boldReqs = requests.filter((r) => r.updateTextStyle?.textStyle?.bold === true);
      expect(boldReqs.length).toBeGreaterThanOrEqual(2);

      // Italic
      const italicReqs = requests.filter((r) => r.updateTextStyle?.textStyle?.italic === true);
      expect(italicReqs.length).toBeGreaterThanOrEqual(1);

      // All text present
      const allText = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText!.text)
        .join('');
      expect(allText).toContain('Project Plan');
      expect(allText).toContain('Ship faster');
      expect(allText).toContain('Execution');
      expect(allText).toContain('Last updated: 2026');
    });
  });
});

// ============================================================
// Google Docs JSON -> Markdown
// ============================================================

describe('Docs to Markdown Conversion', () => {
  describe('Headings', () => {
    it('should convert HEADING_1 to # heading', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                paragraphStyle: { namedStyleType: 'HEADING_1' },
                elements: [{ textRun: { content: 'Hello\n' } }],
              },
            },
          ],
        },
      };
      expect(docsJsonToMarkdown(doc)).toContain('# Hello');
    });

    it('should convert HEADING_2 through HEADING_6', () => {
      const doc = {
        body: {
          content: [2, 3, 4, 5, 6].map((level) => ({
            paragraph: {
              paragraphStyle: { namedStyleType: `HEADING_${level}` },
              elements: [{ textRun: { content: `H${level}\n` } }],
            },
          })),
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('## H2');
      expect(md).toContain('### H3');
      expect(md).toContain('#### H4');
      expect(md).toContain('##### H5');
      expect(md).toContain('###### H6');
    });

    it('should convert TITLE to H1 and SUBTITLE to H2', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                paragraphStyle: { namedStyleType: 'TITLE' },
                elements: [{ textRun: { content: 'My Title\n' } }],
              },
            },
            {
              paragraph: {
                paragraphStyle: { namedStyleType: 'SUBTITLE' },
                elements: [{ textRun: { content: 'My Subtitle\n' } }],
              },
            },
          ],
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('# My Title');
      expect(md).toContain('## My Subtitle');
    });
  });

  describe('Text Formatting', () => {
    it('should convert bold text', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                elements: [{ textRun: { content: 'bold', textStyle: { bold: true } } }],
              },
            },
          ],
        },
      };
      expect(docsJsonToMarkdown(doc)).toContain('**bold**');
    });

    it('should convert italic text', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                elements: [{ textRun: { content: 'italic', textStyle: { italic: true } } }],
              },
            },
          ],
        },
      };
      expect(docsJsonToMarkdown(doc)).toContain('*italic*');
    });

    it('should convert bold+italic text', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'both',
                      textStyle: { bold: true, italic: true },
                    },
                  },
                ],
              },
            },
          ],
        },
      };
      expect(docsJsonToMarkdown(doc)).toContain('***both***');
    });

    it('should convert strikethrough text', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                elements: [{ textRun: { content: 'struck', textStyle: { strikethrough: true } } }],
              },
            },
          ],
        },
      };
      expect(docsJsonToMarkdown(doc)).toContain('~~struck~~');
    });

    it('should convert links', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'click here',
                      textStyle: { link: { url: 'https://example.com' } },
                    },
                  },
                ],
              },
            },
          ],
        },
      };
      expect(docsJsonToMarkdown(doc)).toContain('[click here](https://example.com)');
    });

    it('should detect monospace font as code', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  { textRun: { content: 'normal ' } },
                  {
                    textRun: {
                      content: 'code_here',
                      textStyle: { weightedFontFamily: { fontFamily: 'Roboto Mono' } },
                    },
                  },
                  { textRun: { content: ' more\n' } },
                ],
              },
            },
          ],
        },
      };
      expect(docsJsonToMarkdown(doc)).toContain('`code_here`');
    });
  });

  describe('Lists', () => {
    it('should convert bullet list items', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                bullet: { listId: 'list1', nestingLevel: 0 },
                elements: [{ textRun: { content: 'Item 1\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'list1', nestingLevel: 0 },
                elements: [{ textRun: { content: 'Item 2\n' } }],
              },
            },
          ],
        },
        lists: {
          list1: {
            listProperties: {
              nestingLevels: [{ glyphSymbol: '\u25cf' }],
            },
          },
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('- Item 1');
      expect(md).toContain('- Item 2');
    });

    it('should detect ordered lists via glyphType', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                bullet: { listId: 'olist', nestingLevel: 0 },
                elements: [{ textRun: { content: 'First\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'olist', nestingLevel: 0 },
                elements: [{ textRun: { content: 'Second\n' } }],
              },
            },
          ],
        },
        lists: {
          olist: {
            listProperties: {
              nestingLevels: [{ glyphType: 'DECIMAL' }],
            },
          },
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('1. First');
      expect(md).toContain('1. Second');
    });

    it('should render nested lists with indentation', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                bullet: { listId: 'nlist', nestingLevel: 0 },
                elements: [{ textRun: { content: 'Parent\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'nlist', nestingLevel: 1 },
                elements: [{ textRun: { content: 'Child\n' } }],
              },
            },
          ],
        },
        lists: {
          nlist: {
            listProperties: {
              nestingLevels: [{ glyphSymbol: '\u25cf' }, { glyphSymbol: '\u25cb' }],
            },
          },
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('- Parent');
      expect(md).toContain('  - Child');
    });

    it('should render 3 levels of nested bullet indentation', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                bullet: { listId: 'deep', nestingLevel: 0 },
                elements: [{ textRun: { content: 'Level 0\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'deep', nestingLevel: 1 },
                elements: [{ textRun: { content: 'Level 1\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'deep', nestingLevel: 2 },
                elements: [{ textRun: { content: 'Level 2\n' } }],
              },
            },
          ],
        },
        lists: {
          deep: {
            listProperties: {
              nestingLevels: [
                { glyphSymbol: '\u25cf' },
                { glyphSymbol: '\u25cb' },
                { glyphSymbol: '\u25a0' },
              ],
            },
          },
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('- Level 0');
      expect(md).toContain('  - Level 1');
      expect(md).toContain('    - Level 2');
    });

    it('should render ordered sub-list inside bullet list', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                bullet: { listId: 'mixed', nestingLevel: 0 },
                elements: [{ textRun: { content: 'Bullet parent\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'mixed', nestingLevel: 1 },
                elements: [{ textRun: { content: 'Ordered child\n' } }],
              },
            },
          ],
        },
        lists: {
          mixed: {
            listProperties: {
              nestingLevels: [{ glyphSymbol: '\u25cf' }, { glyphType: 'DECIMAL' }],
            },
          },
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('- Bullet parent');
      expect(md).toContain('  1. Ordered child');
    });

    it('should return to parent indentation level after nested items', () => {
      const doc = {
        body: {
          content: [
            {
              paragraph: {
                bullet: { listId: 'bounce', nestingLevel: 0 },
                elements: [{ textRun: { content: 'First\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'bounce', nestingLevel: 1 },
                elements: [{ textRun: { content: 'Nested\n' } }],
              },
            },
            {
              paragraph: {
                bullet: { listId: 'bounce', nestingLevel: 0 },
                elements: [{ textRun: { content: 'Back to top\n' } }],
              },
            },
          ],
        },
        lists: {
          bounce: {
            listProperties: {
              nestingLevels: [{ glyphSymbol: '\u25cf' }, { glyphSymbol: '\u25cb' }],
            },
          },
        },
      };
      const md = docsJsonToMarkdown(doc);
      const lines = md.split('\n').filter((l) => l.trim());
      const firstLine = lines.find((l) => l.includes('First'));
      const nestedLine = lines.find((l) => l.includes('Nested'));
      const backLine = lines.find((l) => l.includes('Back to top'));

      expect(firstLine).toBe('- First');
      expect(nestedLine).toBe('  - Nested');
      expect(backLine).toBe('- Back to top');
    });
  });

  describe('Code Block Tables', () => {
    it('should detect a 1x1 table with gray background as a code block', () => {
      const doc = {
        body: {
          content: [
            {
              table: {
                tableRows: [
                  {
                    tableCells: [
                      {
                        tableCellStyle: {
                          backgroundColor: {
                            color: { rgbColor: { red: 0.937, green: 0.945, blue: 0.953 } },
                          },
                        },
                        content: [
                          {
                            paragraph: {
                              elements: [
                                {
                                  textRun: {
                                    content: 'const x = 1;\n',
                                    textStyle: {
                                      weightedFontFamily: { fontFamily: 'Roboto Mono' },
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
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('```');
      expect(md).toContain('const x = 1;');
      // Should NOT be a markdown table
      expect(md).not.toContain('|');
    });

    it('should detect a 1x1 table with monospace font as a code block', () => {
      const doc = {
        body: {
          content: [
            {
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
                                  textRun: {
                                    content: 'print("hello")\n',
                                    textStyle: {
                                      weightedFontFamily: { fontFamily: 'Courier New' },
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
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('```');
      expect(md).toContain('print("hello")');
    });

    it('should NOT detect a regular 2x2 table as a code block', () => {
      const doc = {
        body: {
          content: [
            {
              table: {
                tableRows: [
                  {
                    tableCells: [
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: 'A\n' } }] } }],
                      },
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: 'B\n' } }] } }],
                      },
                    ],
                  },
                  {
                    tableCells: [
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: '1\n' } }] } }],
                      },
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: '2\n' } }] } }],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      };
      const md = docsJsonToMarkdown(doc);
      // Should be a markdown table, not a code block
      expect(md).toContain('|');
      expect(md).not.toContain('```');
    });

    it('should handle multi-line content in a code block table', () => {
      const doc = {
        body: {
          content: [
            {
              table: {
                tableRows: [
                  {
                    tableCells: [
                      {
                        tableCellStyle: {
                          backgroundColor: {
                            color: { rgbColor: { red: 0.937, green: 0.945, blue: 0.953 } },
                          },
                        },
                        content: [
                          {
                            paragraph: {
                              elements: [
                                {
                                  textRun: {
                                    content: 'line1\n',
                                    textStyle: {
                                      weightedFontFamily: { fontFamily: 'Roboto Mono' },
                                    },
                                  },
                                },
                              ],
                            },
                          },
                          {
                            paragraph: {
                              elements: [
                                {
                                  textRun: {
                                    content: 'line2\n',
                                    textStyle: {
                                      weightedFontFamily: { fontFamily: 'Roboto Mono' },
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
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('```');
      expect(md).toContain('line1');
      expect(md).toContain('line2');
    });
  });

  describe('Tables', () => {
    it('should convert a simple table', () => {
      const doc = {
        body: {
          content: [
            {
              table: {
                tableRows: [
                  {
                    tableCells: [
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: 'A\n' } }] } }],
                      },
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: 'B\n' } }] } }],
                      },
                    ],
                  },
                  {
                    tableCells: [
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: '1\n' } }] } }],
                      },
                      {
                        content: [{ paragraph: { elements: [{ textRun: { content: '2\n' } }] } }],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('| A | B |');
      expect(md).toContain('| --- | --- |');
      expect(md).toContain('| 1 | 2 |');
    });
  });

  describe('Section Breaks', () => {
    it('should convert section breaks to horizontal rules', () => {
      const doc = {
        body: {
          content: [
            { paragraph: { elements: [{ textRun: { content: 'Before\n' } }] } },
            { sectionBreak: {} },
            { paragraph: { elements: [{ textRun: { content: 'After\n' } }] } },
          ],
        },
      };
      const md = docsJsonToMarkdown(doc);
      expect(md).toContain('---');
      expect(md).toContain('Before');
      expect(md).toContain('After');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty string for empty document', () => {
      expect(docsJsonToMarkdown({})).toBe('');
      expect(docsJsonToMarkdown({ body: {} })).toBe('');
      expect(docsJsonToMarkdown({ body: { content: [] } })).toBe('');
    });

    it('should handle paragraphs with no text runs', () => {
      const doc = {
        body: {
          content: [{ paragraph: { elements: [] } }],
        },
      };
      expect(typeof docsJsonToMarkdown(doc)).toBe('string');
    });
  });
});
