// Rusprofile has no public "/inn/<ИНН>" URL straight to a company's own page
// (that lives at an internal numeric /id/<id> their search resolves
// internally) — but /search-advanced?query=<ИНН> is a real, public,
// anonymous route (confirmed live, no login/session needed) that renders a
// results page with the matching company directly, one click short of the
// /id/ page. /search?query= (no "-advanced") looked similar but is a dead
// 404 — do not swap back to it.
export function rusprofileSearchUrl(inn: string): string {
  return `https://www.rusprofile.ru/search-advanced?query=${encodeURIComponent(inn)}`;
}
