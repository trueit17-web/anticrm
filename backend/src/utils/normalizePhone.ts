import { parsePhoneNumberFromString } from "libphonenumber-js";

// Canonicalizes a raw phone string to E.164 ("+79261234567") so the same
// number written differently ("8 926 123-45-67", "+7 (926) 1234567",
// "89261234567") collapses to one value — which is what makes dedup work.
//
// Defaults to Russia, so bare 10-digit / 8-prefixed numbers parse; explicit
// "+<country>" numbers are still honored. Anything libphonenumber can't parse
// into a valid number (too short, junk, foreign without a code) is kept as-is
// after trimming, so a genuinely-unusual-but-real number is never dropped —
// it just doesn't get normalized (and dedups only against its own raw form).
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const parsed = parsePhoneNumberFromString(trimmed, "RU");
  if (parsed && parsed.isValid()) return parsed.number;
  return trimmed;
}
