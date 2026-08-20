import { prisma } from "../../lib/prisma";
import { getDadataApiKey } from "../branches/branches.service";
import { lookupOrganizationByInn } from "../../utils/dadataLookup";

export type InnWarningLevel = "red" | "yellow" | null;

function dayRange(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Flags a repeated ИНН across the whole branch (any operator, not just the
// current one) — a hint that a lead may already be "burned": red if it was
// last logged under a month ago, yellow if 1–2 months ago, otherwise no
// highlight. Only the most recent earlier row matters.
//
// "Earlier" is determined by createdAt (always strictly ordered, even for
// two rows logged the same business day), not by the `date` field — `date`
// is truncated to midnight, so two same-day rows would tie under `lt` and
// neither would see the other. The day-gap itself is still measured on
// `date` (the business day), so two rows logged the same day correctly
// come out 0 days apart (red), not skipped entirely.
async function getInnWarningLevel(
  branchId: number,
  inn: string,
  entryDate: Date,
  excludeId: number,
  createdAt: Date
): Promise<InnWarningLevel> {
  const prior = await prisma.innEntry.findFirst({
    where: {
      branchId,
      inn,
      id: { not: excludeId },
      createdAt: { lt: createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { date: true },
  });
  if (!prior) return null;
  const days = (entryDate.getTime() - prior.date.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 30) return "red";
  if (days < 60) return "yellow";
  return null;
}

export async function listMyInnEntries(branchId: number, operatorId: number, date: Date) {
  const { start, end } = dayRange(date);
  const entries = await prisma.innEntry.findMany({
    where: { branchId, operatorId, date: { gte: start, lt: end } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      warningLevel: await getInnWarningLevel(branchId, entry.inn, entry.date, entry.id, entry.createdAt),
    }))
  );
}

export async function createInnEntry(params: {
  branchId: number;
  operatorId: number;
  date: Date;
  inn: string;
  contactsCount: number;
  transferredCount: number;
}) {
  const apiKey = await getDadataApiKey(params.branchId);
  const { name, region } = await lookupOrganizationByInn(params.inn, apiKey);
  const entry = await prisma.innEntry.create({
    data: {
      branchId: params.branchId,
      operatorId: params.operatorId,
      date: params.date,
      inn: params.inn,
      companyName: name,
      region,
      contactsCount: params.contactsCount,
      transferredCount: params.transferredCount,
    },
  });
  const warningLevel = await getInnWarningLevel(params.branchId, entry.inn, entry.date, entry.id, entry.createdAt);
  return { ...entry, warningLevel };
}

export async function updateInnEntry(params: {
  id: number;
  branchId: number;
  operatorId: number;
  data: Partial<{ inn: string; contactsCount: number; transferredCount: number }>;
}) {
  const existing = await prisma.innEntry.findUnique({ where: { id: params.id } });
  if (!existing || existing.branchId !== params.branchId || existing.operatorId !== params.operatorId) {
    return null;
  }

  let companyName = existing.companyName;
  let region = existing.region;
  if (params.data.inn !== undefined && params.data.inn !== existing.inn) {
    const apiKey = await getDadataApiKey(params.branchId);
    const lookup = await lookupOrganizationByInn(params.data.inn, apiKey);
    companyName = lookup.name;
    region = lookup.region;
  }

  const entry = await prisma.innEntry.update({
    where: { id: params.id },
    data: { ...params.data, companyName, region },
  });
  const warningLevel = await getInnWarningLevel(params.branchId, entry.inn, entry.date, entry.id, entry.createdAt);
  return { ...entry, warningLevel };
}

export async function deleteInnEntry(id: number, branchId: number, operatorId: number): Promise<boolean> {
  const result = await prisma.innEntry.deleteMany({ where: { id, branchId, operatorId } });
  return result.count > 0;
}

export async function getMyInnStats(branchId: number, operatorId: number, from: Date, to: Date) {
  const agg = await prisma.innEntry.aggregate({
    where: { branchId, operatorId, date: { gte: from, lt: to } },
    _count: { _all: true },
    _sum: { contactsCount: true, transferredCount: true },
  });
  return {
    totalEntries: agg._count._all,
    totalContacts: agg._sum.contactsCount ?? 0,
    totalTransferred: agg._sum.transferredCount ?? 0,
  };
}

export async function getInnStatsSummary(branchId: number, from: Date, to: Date) {
  const entries = await prisma.innEntry.findMany({
    where: { branchId, date: { gte: from, lt: to } },
    select: {
      operatorId: true,
      contactsCount: true,
      transferredCount: true,
      operator: { select: { fullName: true } },
    },
  });

  const byOperatorMap = new Map<
    number,
    { operatorId: number; operatorName: string; entries: number; contacts: number; transferred: number }
  >();
  let totalContacts = 0;
  let totalTransferred = 0;

  for (const entry of entries) {
    totalContacts += entry.contactsCount;
    totalTransferred += entry.transferredCount;
    const bucket = byOperatorMap.get(entry.operatorId) ?? {
      operatorId: entry.operatorId,
      operatorName: entry.operator.fullName,
      entries: 0,
      contacts: 0,
      transferred: 0,
    };
    bucket.entries += 1;
    bucket.contacts += entry.contactsCount;
    bucket.transferred += entry.transferredCount;
    byOperatorMap.set(entry.operatorId, bucket);
  }

  return {
    totalEntries: entries.length,
    totalContacts,
    totalTransferred,
    byOperator: Array.from(byOperatorMap.values()).sort((a, b) => a.operatorName.localeCompare(b.operatorName)),
  };
}
