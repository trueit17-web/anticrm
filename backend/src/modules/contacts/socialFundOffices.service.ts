import { prisma } from "../../lib/prisma";
import { extractCity } from "../../utils/extractCity";
import { findCapitalForRegion } from "../../utils/regionCapitals";
import { stripPostalIndex } from "../../utils/stripPostalIndex";

// The DB's @unique on `city` is case-sensitive, so "Москва" and "москва"
// would otherwise both insert fine — but lookupSocialFundAddress matches
// case-insensitively, so two such rows would be ambiguous. Checked
// explicitly here instead of relying on the DB constraint.
export class DuplicateCityError extends Error {}

async function findByCityInsensitive(city: string, excludeId?: number) {
  return prisma.socialFundOffice.findFirst({
    where: { city: { equals: city, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

export function listSocialFundOffices() {
  return prisma.socialFundOffice.findMany({ orderBy: { city: "asc" } });
}

// Powers the editor modal: the table can be thousands of rows, so it's
// searched server-side (city OR address contains, case-insensitive) and
// capped. `limit` is the max rows returned; the caller learns there are more
// matches from `hasMore` and narrows the search.
export async function searchSocialFundOffices(search: string, limit: number) {
  const where = search
    ? {
        OR: [
          { city: { contains: search, mode: "insensitive" as const } },
          { address: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
  const offices = await prisma.socialFundOffice.findMany({
    where,
    orderBy: { city: "asc" },
    take: limit + 1,
  });
  const hasMore = offices.length > limit;
  return { offices: hasMore ? offices.slice(0, limit) : offices, hasMore };
}

// Powers the admin page's count display — the full list can be thousands
// of rows, too many to render, so the page only shows how many there are
// plus a download link (see exportSocialFundOfficesCsv below).
export function countSocialFundOffices() {
  return prisma.socialFundOffice.count();
}

export async function createSocialFundOffice(city: string, address: string) {
  if (await findByCityInsensitive(city)) throw new DuplicateCityError();
  return prisma.socialFundOffice.create({ data: { city, address: stripPostalIndex(address) } });
}

export async function updateSocialFundOffice(
  id: number,
  data: { city?: string; address?: string }
) {
  if (data.city && (await findByCityInsensitive(data.city, id))) throw new DuplicateCityError();
  const patch = { ...data, ...(data.address !== undefined ? { address: stripPostalIndex(data.address) } : {}) };
  const result = await prisma.socialFundOffice.updateMany({ where: { id }, data: patch });
  if (result.count === 0) return null;
  return prisma.socialFundOffice.findUnique({ where: { id } });
}

export async function deleteSocialFundOffice(id: number) {
  const result = await prisma.socialFundOffice.deleteMany({ where: { id } });
  return result.count > 0;
}

// A city/address starting with =, +, - or @ would otherwise be interpreted
// as a formula when the export is opened in Excel/Sheets — prefixing with a
// literal quote (Excel's own "treat as text" convention) neutralizes that.
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Builds the downloadable CSV for the admin page. Prefixed with a UTF-8 BOM
// (﻿) so Excel opens Cyrillic text correctly instead of mangling it.
export async function exportSocialFundOfficesCsv(): Promise<string> {
  const offices = await listSocialFundOffices();
  const lines = ["Город,Адрес", ...offices.map((o) => `${csvField(o.city)},${csvField(o.address)}`)];
  return "﻿" + lines.join("\r\n");
}

async function findOfficeByCity(city: string) {
  return prisma.socialFundOffice.findFirst({ where: { city: { equals: city, mode: "insensitive" } } });
}

// `city` is null when no city could be parsed out of the address at all;
// `address` is null if nothing in the admin-curated (regional-capital-only)
// list matches that city either — the frontend renders the same "не
// найден" state for both. Only capitals are kept in the table, so a client
// in a smaller town/district falls back to their region's capital office
// (via the separate "Регион" field, when the caller has it) instead of
// coming back empty.
export async function lookupSocialFundAddress(
  rawAddress: string,
  regionHint?: string
): Promise<{ city: string | null; address: string | null }> {
  const city = extractCity(rawAddress);
  if (city) {
    const office = await findOfficeByCity(city);
    if (office) return { city, address: office.address };
  }

  if (regionHint) {
    const capital = findCapitalForRegion(regionHint);
    if (capital) {
      const office = await findOfficeByCity(capital);
      if (office) return { city: capital, address: office.address };
    }
  }

  return { city, address: null };
}
