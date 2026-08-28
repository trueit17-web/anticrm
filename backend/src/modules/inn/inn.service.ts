import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getDadataApiKey } from "../branches/branches.service";
import { lookupOrganizationByInn } from "../../utils/dadataLookup";

export type InnWarningLevel = "red" | "yellow" | null;

const INN_FIELD_LABELS: Record<string, string> = {
  inn: "ИНН",
  companyName: "Название",
  region: "Регион",
  date: "Дата",
  contactsCount: "Чел.",
  transferredCount: "Передано",
  called: "Прозвонена",
  category: "Категория",
  note: "Примечание",
  operatorId: "Оператор",
};

function resolveInnDisplayValue(field: string, value: unknown): string | null {
  if (field === "called") return value ? "Да" : "Нет";
  if (value === null || value === undefined || value === "") return null;
  if (field === "date") return (value as Date).toISOString().slice(0, 10);
  return String(value);
}

// Diffs `before` against `changes` field-by-field and appends one
// InnEntryHistory row per actually-changed field — same "diff at write time"
// approach as updateAppealWithHistory, so a client-facing "история
// изменений" list is available per row, same as trubka history.
// `operatorNames` lets adminUpdateInnEntry show fullName instead of a raw id
// when the operator itself was reassigned.
async function recordInnEntryHistory(
  tx: Prisma.TransactionClient,
  entryId: number,
  before: Record<string, unknown>,
  changes: Record<string, unknown>,
  changedById: number,
  operatorNames?: Record<number, string>
): Promise<void> {
  const rows: Prisma.InnEntryHistoryCreateManyInput[] = [];
  for (const field of Object.keys(changes)) {
    const oldRaw = before[field];
    const newRaw = changes[field];
    const oldComparable = oldRaw instanceof Date ? oldRaw.toISOString() : oldRaw;
    const newComparable = newRaw instanceof Date ? newRaw.toISOString() : newRaw;
    if (oldComparable === newComparable) continue;

    const oldValue =
      field === "operatorId" && operatorNames
        ? operatorNames[oldRaw as number] ?? resolveInnDisplayValue(field, oldRaw)
        : resolveInnDisplayValue(field, oldRaw);
    const newValue =
      field === "operatorId" && operatorNames
        ? operatorNames[newRaw as number] ?? resolveInnDisplayValue(field, newRaw)
        : resolveInnDisplayValue(field, newRaw);

    rows.push({
      entryId,
      changedById,
      field,
      fieldLabel: INN_FIELD_LABELS[field] ?? field,
      oldValue,
      newValue,
    });
  }
  if (rows.length > 0) {
    await tx.innEntryHistory.createMany({ data: rows });
  }
}

function dayRange(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Flags a repeated ИНН across the whole system — not just the current
// branch or operator — a hint that a lead may already be "burned" by anyone,
// anywhere: red if it was last logged under a month ago, yellow if 1–2
// months ago, otherwise no highlight. Only the most recent earlier row
// matters. `branchId` is unused for the lookup itself (kept so call sites
// don't need to change) but callers still pass their own branch for clarity.
//
// "Earlier" is determined by createdAt (always strictly ordered, even for
// two rows logged the same business day), not by the `date` field — `date`
// is truncated to midnight, so two same-day rows would tie under `lt` and
// neither would see the other. The day-gap itself is still measured on
// `date` (the business day), so two rows logged the same day correctly
// come out 0 days apart (red), not skipped entirely.
function findPriorInnEntry(inn: string, excludeId: number, createdAt: Date) {
  return prisma.innEntry.findFirst({
    where: {
      inn,
      id: { not: excludeId },
      createdAt: { lt: createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { date: true, branchId: true, branch: { select: { name: true } }, operator: { select: { fullName: true } } },
  });
}

async function getInnWarningLevel(
  branchId: number,
  inn: string,
  entryDate: Date,
  excludeId: number,
  createdAt: Date
): Promise<InnWarningLevel> {
  const prior = await findPriorInnEntry(inn, excludeId, createdAt);
  if (!prior) return null;
  const days = (entryDate.getTime() - prior.date.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 30) return "red";
  if (days < 60) return "yellow";
  return null;
}

// Pre-save preview for the create/update form: "would this ИНН trigger a
// warning if saved right now with this date?" — same red/yellow rule as
// getInnWarningLevel (and, like it, cross-branch), but there's no row (and
// so no id/createdAt) yet, so it just looks at the latest existing row for
// this ИНН anywhere.
export async function previewInnWarning(
  branchId: number,
  inn: string,
  entryDate: Date
): Promise<{ warningLevel: InnWarningLevel; lastDate: Date | null }> {
  const prior = await prisma.innEntry.findFirst({
    where: { inn },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!prior) return { warningLevel: null, lastDate: null };
  const days = (entryDate.getTime() - prior.date.getTime()) / (1000 * 60 * 60 * 24);
  const warningLevel: InnWarningLevel = days < 30 ? "red" : days < 60 ? "yellow" : null;
  return { warningLevel, lastDate: prior.date };
}

// Entries created before this date are historical (bulk-imported) data and
// must never be auto-moved — only entries logged from this date onward
// participate in the "not called → rolls to the next day" carry-over below.
const INN_ROLLOVER_CUTOFF = new Date("2026-08-21T00:00:00.000Z");

// Lazily carries forward any of the operator's own entries that are still
// sitting on a past day without "прозвонена" set — an operator who didn't
// finish calling an organization sees it again today instead of it quietly
// aging out of view. Runs on every fetch of the operator's own log (cheap
// no-op update when nothing is stale) rather than on a schedule, per the
// "перенос при заходе оператора" requirement — no cron/background job.
async function rolloverStaleInnEntries(branchId: number, operatorId: number): Promise<void> {
  const { start: todayStart } = dayRange(new Date());
  const stale = await prisma.innEntry.findMany({
    where: {
      branchId,
      operatorId,
      called: false,
      date: { gte: INN_ROLLOVER_CUTOFF, lt: todayStart },
    },
    select: { id: true, date: true },
  });
  if (stale.length === 0) return;

  // One row per moved entry rather than a bulk updateMany, so each carry
  // -forward still leaves a "Дата: старое → новое" trail in история
  // изменений — otherwise this automatic move would be invisible there.
  await prisma.$transaction(async (tx) => {
    for (const entry of stale) {
      await tx.innEntry.update({ where: { id: entry.id }, data: { date: todayStart } });
      await recordInnEntryHistory(tx, entry.id, { date: entry.date }, { date: todayStart }, operatorId);
    }
  });
}

export async function listMyInnEntries(branchId: number, operatorId: number, date: Date) {
  await rolloverStaleInnEntries(branchId, operatorId);
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
  called: boolean;
  category?: string | null;
  note?: string | null;
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
      called: params.called,
      category: params.category ?? null,
      note: params.note ?? null,
    },
  });
  const warningLevel = await getInnWarningLevel(params.branchId, entry.inn, entry.date, entry.id, entry.createdAt);
  return { ...entry, warningLevel };
}

export async function updateInnEntry(params: {
  id: number;
  branchId: number;
  operatorId: number;
  changedById: number;
  data: Partial<{
    inn: string;
    date: Date;
    contactsCount: number;
    transferredCount: number;
    called: boolean;
    category: string | null;
    note: string | null;
  }>;
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

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.innEntry.update({
      where: { id: params.id },
      data: { ...params.data, companyName, region },
    });
    await recordInnEntryHistory(tx, params.id, existing, params.data, params.changedById);
    return updated;
  });
  const warningLevel = await getInnWarningLevel(params.branchId, entry.inn, entry.date, entry.id, entry.createdAt);
  return { ...entry, warningLevel };
}

export async function deleteInnEntry(id: number, branchId: number, operatorId: number): Promise<boolean> {
  const result = await prisma.innEntry.deleteMany({ where: { id, branchId, operatorId } });
  return result.count > 0;
}

// ADMIN/SUPERADMIN deleting any operator's entry from the Статистика
// bulk-edit view — branch-scoped only, not the caller's own operatorId.
export async function adminDeleteInnEntry(id: number, branchId: number): Promise<boolean> {
  const result = await prisma.innEntry.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}

// ADMIN/SUPERADMIN editing another operator's entry from the Статистика
// bulk-edit view — unlike updateInnEntry, not scoped to the caller's own
// operatorId. ИНН itself is deliberately not editable here (see
// adminUpdateSchema in the controller) — company/region/date/counts/
// operator are, since this exists to clean up bulk-imported historical data
// and (via operatorId) to reassign a row to a different operator.
export async function adminUpdateInnEntry(params: {
  id: number;
  branchId: number;
  changedById: number;
  data: Partial<{
    companyName: string | null;
    region: string | null;
    date: Date;
    contactsCount: number;
    transferredCount: number;
    called: boolean;
    category: string | null;
    note: string | null;
    operatorId: number;
  }>;
}) {
  const entry = await prisma.$transaction(async (tx) => {
    const existing = await tx.innEntry.findFirst({ where: { id: params.id, branchId: params.branchId } });
    if (!existing) return null;

    // Reassigning operatorId is the one field whose history entry should
    // read as a name, not a raw id — resolve old/new fullName up front.
    let operatorNames: Record<number, string> | undefined;
    if (params.data.operatorId !== undefined && params.data.operatorId !== existing.operatorId) {
      const ids = [existing.operatorId, params.data.operatorId];
      const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
      operatorNames = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
    }

    const updated = await tx.innEntry.update({
      where: { id: params.id },
      data: params.data,
      include: { operator: { select: { fullName: true } } },
    });
    await recordInnEntryHistory(tx, params.id, existing, params.data, params.changedById, operatorNames);
    return updated;
  });
  if (!entry) return null;
  const { operator, ...rest } = entry;
  const warningLevel = await getInnWarningLevel(params.branchId, rest.inn, rest.date, rest.id, rest.createdAt);
  return { ...rest, operatorName: operator.fullName, warningLevel };
}

// Re-runs the dadata lookup for an entry's current ИНН and overwrites
// название/регион with whatever comes back — the "refresh" icon in
// Статистика, for entries whose company data is missing or stale (e.g.
// looked up before a dadata key was configured, or from the bulk historical
// import which trusted the spreadsheet's own values as-is).
export async function refreshInnEntryFromDadata(id: number, branchId: number, changedById: number, operatorId?: number) {
  const entry = await prisma.innEntry.findUnique({ where: { id } });
  if (!entry || entry.branchId !== branchId) return null;
  if (operatorId !== undefined && entry.operatorId !== operatorId) return null;
  const apiKey = await getDadataApiKey(branchId);
  const { name, region } = await lookupOrganizationByInn(entry.inn, apiKey);
  const changes = { companyName: name, region };
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.innEntry.update({
      where: { id },
      data: changes,
      include: { operator: { select: { fullName: true } } },
    });
    await recordInnEntryHistory(tx, id, entry, changes, changedById);
    return result;
  });
  const { operator, ...rest } = updated;
  const warningLevel = await getInnWarningLevel(branchId, rest.inn, rest.date, rest.id, rest.createdAt);
  return { ...rest, operatorName: operator.fullName, warningLevel };
}

// Flat (not grouped by operator) list of every entry in the branch for a
// period — powers the Статистика "массовое редактирование" view, which
// needs every row editable at once rather than drilled into one operator
// at a time.
export async function listBranchInnEntries(branchId: number, from: Date, to: Date) {
  const entries = await prisma.innEntry.findMany({
    where: { branchId, date: { gte: from, lt: to } },
    include: { operator: { select: { fullName: true } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  return Promise.all(
    entries.map(async ({ operator, ...entry }) => ({
      ...entry,
      operatorName: operator.fullName,
      warningLevel: await getInnWarningLevel(branchId, entry.inn, entry.date, entry.id, entry.createdAt),
    }))
  );
}

// Search by ИНН substring across every date in the branch — unlike
// listBranchInnEntries, deliberately ignores the period picker: the whole
// point of the search box is to find a match regardless of when it was
// logged, per the "поиск должен показать все такие ИНН за любую дату"
// requirement.
export async function searchBranchInnEntries(branchId: number, query: string) {
  const entries = await prisma.innEntry.findMany({
    where: { branchId, inn: { contains: query } },
    include: { operator: { select: { fullName: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return Promise.all(
    entries.map(async ({ operator, ...entry }) => ({
      ...entry,
      operatorName: operator.fullName,
      warningLevel: await getInnWarningLevel(branchId, entry.inn, entry.date, entry.id, entry.createdAt),
    }))
  );
}

// Personal counterpart for a manager's own "массовое редактирование" search
// — same date-agnostic search, scoped to their own rows.
export async function searchOperatorInnEntries(branchId: number, operatorId: number, query: string) {
  const entries = await prisma.innEntry.findMany({
    where: { branchId, operatorId, inn: { contains: query } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      warningLevel: await getInnWarningLevel(branchId, entry.inn, entry.date, entry.id, entry.createdAt),
    }))
  );
}

export async function getMyInnStats(branchId: number, operatorId: number, from: Date, to: Date) {
  const [agg, calledCount] = await Promise.all([
    prisma.innEntry.aggregate({
      where: { branchId, operatorId, date: { gte: from, lt: to } },
      _count: { _all: true },
      _sum: { contactsCount: true, transferredCount: true },
    }),
    prisma.innEntry.count({ where: { branchId, operatorId, date: { gte: from, lt: to }, called: true } }),
  ]);
  return {
    totalEntries: agg._count._all,
    totalContacts: agg._sum.contactsCount ?? 0,
    totalTransferred: agg._sum.transferredCount ?? 0,
    totalCalled: calledCount,
  };
}

// Finds the operator's own most recent ИНН entry matching the search text
// (substring match — the search box needs to find "796" inside
// "7736207543", not just exact ИНН), across every date, so the frontend can
// jump the drawer's date picker to it and highlight the row.
export async function searchInnEntry(branchId: number, operatorId: number, query: string) {
  return prisma.innEntry.findFirst({
    where: { branchId, operatorId, inn: { contains: query } },
    orderBy: { date: "desc" },
  });
}

export async function getInnStatsSummary(branchId: number, from: Date, to: Date) {
  const entries = await prisma.innEntry.findMany({
    where: { branchId, date: { gte: from, lt: to } },
    select: {
      id: true,
      date: true,
      createdAt: true,
      inn: true,
      operatorId: true,
      contactsCount: true,
      transferredCount: true,
      called: true,
      operator: { select: { fullName: true } },
    },
  });

  const byOperatorMap = new Map<
    number,
    {
      operatorId: number;
      operatorName: string;
      entries: number;
      contacts: number;
      transferred: number;
      repeats: number;
      called: number;
    }
  >();
  let totalContacts = 0;
  let totalTransferred = 0;
  let totalRepeats = 0;
  let totalCalled = 0;

  for (const entry of entries) {
    totalContacts += entry.contactsCount;
    totalTransferred += entry.transferredCount;
    if (entry.called) totalCalled += 1;
    const warningLevel = await getInnWarningLevel(branchId, entry.inn, entry.date, entry.id, entry.createdAt);
    if (warningLevel) totalRepeats += 1;
    const bucket = byOperatorMap.get(entry.operatorId) ?? {
      operatorId: entry.operatorId,
      operatorName: entry.operator.fullName,
      entries: 0,
      contacts: 0,
      transferred: 0,
      repeats: 0,
      called: 0,
    };
    bucket.entries += 1;
    bucket.contacts += entry.contactsCount;
    bucket.transferred += entry.transferredCount;
    if (warningLevel) bucket.repeats += 1;
    if (entry.called) bucket.called += 1;
    byOperatorMap.set(entry.operatorId, bucket);
  }

  return {
    totalEntries: entries.length,
    totalContacts,
    totalTransferred,
    totalRepeats,
    totalCalled,
    byOperator: Array.from(byOperatorMap.values()).sort((a, b) => a.operatorName.localeCompare(b.operatorName)),
  };
}

// History of field changes for one ИНН entry — powers the click-to-expand
// row in Статистика → ИНН for ADMIN/SUPERADMIN, same UX as a trubka's
// "История изменений". Branch-scoped only (not operatorId-scoped): an
// admin/superadmin can inspect any row's history in their view.
export async function getInnEntryHistory(entryId: number, branchId: number) {
  const entry = await prisma.innEntry.findFirst({
    where: { id: entryId, branchId },
    select: { id: true, inn: true, date: true, createdAt: true },
  });
  if (!entry) return null;

  const [history, prior] = await Promise.all([
    prisma.innEntryHistory.findMany({
      where: { entryId },
      include: { changedBy: { select: { id: true, fullName: true } } },
      orderBy: { changedAt: "desc" },
    }),
    findPriorInnEntry(entry.inn, entryId, entry.createdAt),
  ]);

  // Same red/yellow window as the row's own warningLevel highlight — the
  // repeat card only makes sense while that highlight would still show.
  // `branchName` is only set when the repeat came from a different
  // branch than this entry's own — same-branch repeats don't need it.
  let repeat: { date: string; operatorName: string; branchName: string | null } | null = null;
  if (prior) {
    const days = (entry.date.getTime() - prior.date.getTime()) / (1000 * 60 * 60 * 24);
    if (days < 60) {
      repeat = {
        date: prior.date.toISOString(),
        operatorName: prior.operator.fullName,
        branchName: prior.branchId !== branchId ? prior.branch.name : null,
      };
    }
  }

  return { history, repeat };
}

// Detailed ИНН log for one operator in a period — powers the expand-on-click
// row in the ADMIN/SUPERADMIN summary table.
export async function getOperatorInnEntries(branchId: number, operatorId: number, from: Date, to: Date) {
  const entries = await prisma.innEntry.findMany({
    where: { branchId, operatorId, date: { gte: from, lt: to } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      warningLevel: await getInnWarningLevel(branchId, entry.inn, entry.date, entry.id, entry.createdAt),
    }))
  );
}
