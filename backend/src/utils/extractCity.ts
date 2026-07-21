// Pulls a city name out of a free-form client address string, e.g.
// "г. Москва, ул. Ленина, д. 1" or "Москва, ул. Ленина д.1" → "Москва".
// Used to match against the admin-curated "город → адрес СФР" list.
export function extractCity(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  // Explicit "г."/"город"/"гор." marker anywhere in the string.
  const markerMatch = trimmed.match(
    /(?:^|[,;])\s*(?:г\.?|город|гор\.)\s*([A-ZА-ЯЁ][a-zа-яё-]+(?:[\s-][A-ZА-ЯЁ][a-zа-яё-]+)*)/i
  );
  if (markerMatch) return markerMatch[1].trim();

  // No marker — fall back to the first comma-separated segment (common
  // "Город, ул. ..." layout), stripping a leading "г."/"город" if present.
  const firstSegment = trimmed.split(",")[0]?.trim();
  if (!firstSegment) return null;
  const stripped = firstSegment.replace(/^(?:г\.?|город|гор\.)\s*/i, "").trim();
  return stripped || null;
}
