import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseLayoutTables, validateTableQuality, parseIndianNumber, extractJsonBlock } from '../table-extractor';

const statementText = `
Particulars                   31-Mar-25     31-Mar-24
Revenue from operations       12,345.67     10,987.65
Other income                      234.50        198.20
Total revenue                 12,580.17     11,185.85
Expenses                      10,234.56      9,876.54
Profit before tax              2,345.61      1,309.31
`;

describe('table-extractor layout path', () => {
  it('parses whitespace-aligned statement rows', () => {
    const tables = parseLayoutTables(statementText);
    assert.strictEqual(tables.length, 1);
    const rows = tables[0].rows;
    assert.strictEqual(rows.length, 5);
    const revenueRow = rows.find((r) => r[0] && r[0].includes('Revenue'));
    assert.ok(revenueRow, 'revenue row should exist');
    assert.strictEqual(revenueRow[1], '12,345.67');
    assert.strictEqual(revenueRow[2], '10,987.65');
  });

  it('scores quality from numeric cell fraction', () => {
    const tables = parseLayoutTables(statementText);
    assert.strictEqual(validateTableQuality(tables), 1);
  });

  it('returns empty for prose without tables', () => {
    const tables = parseLayoutTables('The company performed well during the year. Growth was driven by domestic demand.');
    assert.strictEqual(tables.length, 0);
  });
});

describe('parseIndianNumber', () => {
  it('parses Indian digit-grouped values', () => {
    assert.strictEqual(parseIndianNumber('12,345.67'), 12345.67);
    assert.strictEqual(parseIndianNumber('1,234'), 1234);
    assert.strictEqual(parseIndianNumber('0.05'), 0.05);
  });

  it('handles units and parentheses', () => {
    assert.strictEqual(parseIndianNumber('₹ 45 Cr'), 450000000);
    assert.strictEqual(parseIndianNumber('12 Mn'), 12000000);
    assert.strictEqual(parseIndianNumber('5 Lakh'), 500000);
    assert.strictEqual(parseIndianNumber('(12.5)'), -12.5);
  });

  it('rejects labels and blanks', () => {
    assert.strictEqual(parseIndianNumber('Revenue'), null);
    assert.strictEqual(parseIndianNumber(''), null);
    assert.strictEqual(parseIndianNumber('--'), null);
  });
});

describe('extractJsonBlock', () => {
  it('extracts JSON from a wrapped LLM reply', () => {
    const reply = 'Here is the table:\n```json\n{"columns": ["a"], "rows": [["1"]]}\n```';
    assert.deepStrictEqual(extractJsonBlock(reply), { columns: ['a'], rows: [['1']] });
  });

  it('throws when no JSON present', () => {
    assert.throws(() => extractJsonBlock('no json here'));
  });
});