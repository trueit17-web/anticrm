// Drops a leading 6-digit Russian postal index (+ optional comma/space) from
// an address string, e.g. "420127, Республика Татарстан, г. Казань, ..." →
// "Республика Татарстан, г. Казань, ...". Addresses without a leading index
// are returned unchanged. Kept in one place so both the one-off migration and
// the create/update path strip it the same way.
export function stripPostalIndex(address: string): string {
  return address.replace(/^\s*\d{6}\s*,?\s*/, "").trim();
}
