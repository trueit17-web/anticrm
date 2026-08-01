// Formats a monetary value (deposits, the "Деп." field) as grouped rubles
// with a ₽ suffix, e.g. 2322233 → "2 322 233 ₽". Accepts numbers and
// human-typed strings with mixed grouping — spaces, commas or dots as
// thousand separators ("2 322 233", "2,322,233", "2.322.233") and either
// comma or dot as the decimal separator ("2322233,50"). A value that isn't a
// number at all (freeform note) is returned unchanged; empty/nullish → "—".
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const raw = String(value).trim();
  if (raw === "") return "—";
  const n = typeof value === "number" ? value : parseAmount(raw);
  if (n === null) return raw;
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

// Parses a human-typed amount, tolerating space/comma/dot grouping and either
// comma or dot as the decimal separator. Returns null when it isn't a number.
function parseAmount(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(compact)) return null;
  const neg = compact.startsWith("-");
  let s = neg ? compact.slice(1) : compact;

  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;

  if (commas && dots) {
    // Both present → the rightmost is the decimal separator, the other groups.
    const decIsComma = s.lastIndexOf(",") > s.lastIndexOf(".");
    s = decIsComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (commas > 1) {
    s = s.replace(/,/g, ""); // e.g. "2,322,233" → grouping
  } else if (dots > 1) {
    s = s.replace(/\./g, "");
  } else if (commas === 1) {
    // A lone comma with exactly 3 trailing digits is grouping ("1,234"),
    // otherwise it's a decimal ("2322233,50").
    const after = s.length - s.lastIndexOf(",") - 1;
    s = after === 3 ? s.replace(",", "") : s.replace(",", ".");
  } else if (dots === 1) {
    const after = s.length - s.lastIndexOf(".") - 1;
    if (after === 3) s = s.replace(".", ""); // "2.322" → grouping (whole rubles)
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
