import { StatBucket } from "../types";

// Compact "Источник1: 3, Источник2: 2" string for a StatBucket[] — used next
// to a plain trubka count wherever we also want to show the по-источнику
// split without a full table (dashboard tiles, employee card).
export function formatSourceBreakdown(buckets: StatBucket[]): string {
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => `${b.value}: ${b.count}`)
    .join(", ");
}
