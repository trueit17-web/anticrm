import { prisma } from "../../lib/prisma";
import { extractCity } from "../../utils/extractCity";
import { findCapitalForRegion } from "../../utils/regionCapitals";

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

// Powers the admin page's count display — the full list can be thousands
// of rows, too many to render, so the page only shows how many there are
// plus a download link (see exportSocialFundOfficesCsv below).
export function countSocialFundOffices() {
  return prisma.socialFundOffice.count();
}

export async function createSocialFundOffice(city: string, address: string) {
  if (await findByCityInsensitive(city)) throw new DuplicateCityError();
  return prisma.socialFundOffice.create({ data: { city, address } });
}

export async function updateSocialFundOffice(
  id: number,
  data: { city?: string; address?: string }
) {
  if (data.city && (await findByCityInsensitive(data.city, id))) throw new DuplicateCityError();
  const result = await prisma.socialFundOffice.updateMany({ where: { id }, data });
  if (result.count === 0) return null;
  return prisma.socialFundOffice.findUnique({ where: { id } });
}

export async function deleteSocialFundOffice(id: number) {
  const result = await prisma.socialFundOffice.deleteMany({ where: { id } });
  return result.count > 0;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
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
