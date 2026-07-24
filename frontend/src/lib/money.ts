// Formats a monetary value (deposits, the "Деп." field) as grouped rubles
// with a ₽ suffix, e.g. 2219041 → "2 219 041 ₽". Purely-numeric strings and
// numbers are formatted; a freeform hand-typed note that isn't a plain number
// is returned unchanged so nothing is lost. Empty/nullish → "—".
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const raw = String(value).trim();
  if (raw === "") return "—";
  // Only treat as money when it's just a number (digits + optional spaces/.,).
  if (!/^-?[\d\s.,]+$/.test(raw)) return raw;
  const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return raw;
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}
