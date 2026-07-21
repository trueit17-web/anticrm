// Pulls a city name out of a free-form client address string. Real uploaded
// addresses are inconsistent: some are cleanly comma-separated with a
// "г. Город" marker ("респ. Татарстан, г. Казань, ул. Беломорская, ..."),
// some put the marker after the name in its own segment ("Нижнекамск г"),
// some have no commas at all ("420004 г. Казань ул. Окольная д. 3"), and
// some are just space-separated tokens with no marker whatsoever. Casing
// isn't reliable either — real data is often all-lowercase.
//
// Used to match against the admin-curated "город → адрес СФР" list.
const MARKER_FIRST = /^(?:г\.?|город|гор\.)\s+(.+)$/i;
const MARKER_LAST = /^(.+?)\s+(?:г\.?|город|гор\.)$/i;
const MARKER_TOKEN = /^(?:г\.?|город|гор\.)$/i;

function stripTrailingPunct(s: string): string {
  return s.replace(/[.,;]+$/, "");
}

export function extractCity(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  // Some sources join fields with runs of spaces instead of commas (e.g.
  // "татарстан респ  нижнекамский р-н  нижнекамск г  химиков пр-кт  ..."),
  // so a double-space run is treated as the same kind of field boundary as
  // a comma; single spaces stay inside a segment.
  const segments = trimmed
    .split(/[,;]|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length > 1) {
    for (const seg of segments) {
      const firstMatch = seg.match(MARKER_FIRST);
      if (firstMatch) return firstMatch[1].trim();
      const lastMatch = seg.match(MARKER_LAST);
      if (lastMatch) return lastMatch[1].trim();
    }
    // No segment has an explicit marker — assume the common "Город, ул.
    // ..." layout and take the bare first segment as the city.
    return segments[0];
  }

  // No comma anywhere — scan whitespace-separated tokens for a standalone
  // "г"/"город" marker and take whichever neighboring token holds the name
  // (marker can come before or after it in this kind of data).
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (!MARKER_TOKEN.test(stripTrailingPunct(tokens[i]))) continue;
    if (tokens[i + 1]) return stripTrailingPunct(tokens[i + 1]);
    if (i > 0) return stripTrailingPunct(tokens[i - 1]);
  }
  return null;
}
