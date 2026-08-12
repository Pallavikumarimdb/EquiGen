/**
 * math-sumprecise-polyfill.ts — runtime guard for the pdf.js build bundled inside unpdf 1.8.
 *
 * unpdf's pdf.js calls `Math.sumPrecise(...)` unconditionally in its Type1/CFF → OpenType
 * font-conversion path, and V8 has never exposed the API to Node builds (verified absent on
 * Node 20/22/24/26). The call throws `TypeError: Math.sumPrecise is not a function` inside
 * the Font constructor; pdf.js catches it, logs the warning, and silently falls back to a
 * system-font substitute — destroying the glyph→Unicode (ToUnicode) mapping for that font.
 * In financial PDFs (Word-exported subsets like `SYDGCY+ArialMT`, `BCDLEE+SymbolMT`) this is
 * exactly the "numbers quietly degrade" failure mode: symbol glyphs (₹ ± × • –) stop mapping.
 *
 * Must be imported BEFORE any module that pulls in unpdf/pdf.js, so the guard exists before
 * pdf.js's Font code can run. The fallback accumulates in fp64, which is equivalent for the
 * font-metrics/checksum arithmetic pdf.js performs.
 */
const MathWith = Math as unknown as { sumPrecise?: (values: Iterable<number>) => number };

if (typeof MathWith.sumPrecise !== 'function') {
  MathWith.sumPrecise = (values: Iterable<number>): number => {
    let sum = 0;
    for (const value of values) {
      sum += value;
    }
    return sum;
  };
}