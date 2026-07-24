import { ContactStatus, OptionField, Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { createAppeal } from "../appeals/appeals.service";
import { getDefaultOptionValue } from "../select-options/select-options.service";
import { ParsedContact } from "../../utils/parseContactsFile";
import { normalizePhone } from "../../utils/normalizePhone";

const batchInclude = {
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ContactBatchInclude;

const contactInclude = {
  claimedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ContactInclude;

export type ContactBatchWithUploader = Prisma.ContactBatchGetPayload<{ include: typeof batchInclude }>;

export interface CreateBatchResult {
  // null when nothing new was added (every number was a duplicate) — no empty
  // batch is created in that case, so re-uploading the same base doesn't
  // litter "Загруженные базы" with zero-contact entries.
  batch: ContactBatchWithUploader | null;
  parsed: number; // rows the file parser produced
  added: number; // contacts actually inserted
  duplicatesInFile: number; // dropped: the same normalized number appeared earlier in this file
  alreadyInBranch: number; // dropped: that normalized number is already a contact in this branch
}

export async function createBatch(
  branchId: number,
  uploadedById: number,
  fileName: string,
  rows: ParsedContact[]
): Promise<CreateBatchResult> {
  const parsed = rows.length;

  // 1. Normalize every phone to E.164 and drop within-file duplicates,
  //    keeping the first occurrence (and its name/extraInfo).
  const seen = new Set<string>();
  const deduped: (ParsedContact & { phone: string })[] = [];
  let duplicatesInFile = 0;
  for (const r of rows) {
    const phone = normalizePhone(r.phone);
    if (!phone) continue; // parser already drops empties, but be safe
    if (seen.has(phone)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(phone);
    deduped.push({ ...r, phone });
  }

  // 2. Drop numbers that already exist anywhere in this branch's Прозвон, so
  //    a monthly re-upload doesn't re-queue people who were already called.
  //    (Matches only against numbers stored in the new normalized form —
  //    legacy un-normalized rows won't collide, which is acceptable.)
  const phones = deduped.map((r) => r.phone);
  const existing = phones.length
    ? await prisma.contact.findMany({ where: { branchId, phone: { in: phones } }, select: { phone: true } })
    : [];
  const existingSet = new Set(existing.map((e) => e.phone));
  const toInsert = deduped.filter((r) => !existingSet.has(r.phone));
  const alreadyInBranch = deduped.length - toInsert.length;
  const added = toInsert.length;

  if (added === 0) {
    return { batch: null, parsed, added: 0, duplicatesInFile, alreadyInBranch };
  }

  const batch = await prisma.contactBatch.create({
    data: { branchId, uploadedById, fileName, totalCount: added },
  });
  await prisma.contact.createMany({
    data: toInsert.map((r) => ({
      branchId,
      batchId: batch.id,
      phone: r.phone,
      fullName: r.fullName ?? null,
      extraInfo: r.extraInfo ?? null,
    })),
  });

  const withUploader = await prisma.contactBatch.findUnique({ where: { id: batch.id }, include: batchInclude });
  return { batch: withUploader, parsed, added, duplicatesInFile, alreadyInBranch };
}

export async function listBatches(branchId: number) {
  const batches = await prisma.contactBatch.findMany({
    where: { branchId },
    include: batchInclude,
    orderBy: { createdAt: "desc" },
  });

  const grouped = await prisma.contact.groupBy({
    by: ["batchId", "status"],
    where: { branchId },
    _count: { _all: true },
  });

  const countsByBatch = new Map<number, Partial<Record<ContactStatus, number>>>();
  for (const g of grouped) {
    const counts = countsByBatch.get(g.batchId) ?? {};
    counts[g.status] = g._count._all;
    countsByBatch.set(g.batchId, counts);
  }

  return batches.map((b) => ({ ...b, counts: countsByBatch.get(b.id) ?? {} }));
}

// Shared with claimContact/claimNext below — a delete and a claim on the
// same batch must never interleave. Without this, deleteBatch could count
// zero active contacts, then a concurrent claim flips one to IN_PROGRESS,
// and the cascade delete removes it anyway — silently destroying a contact
// someone is actively working, the exact thing the active-contact check
// below exists to prevent.
const BATCH_LOCK_NAMESPACE = 0x42415443; // "BATC"

async function lockBatch(tx: Prisma.TransactionClient, batchId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BATCH_LOCK_NAMESPACE}::int, ${batchId}::int)`;
}

export type DeleteBatchResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "has_active_contacts"; activeCount?: number };

export async function deleteBatch(id: number, branchId: number): Promise<DeleteBatchResult> {
  return prisma.$transaction(async (tx) => {
    await lockBatch(tx, id);
    const batch = await tx.contactBatch.findFirst({ where: { id, branchId }, select: { id: true } });
    if (!batch) return { ok: false, error: "not_found" };

    const activeCount = await tx.contact.count({ where: { batchId: id, status: { not: ContactStatus.NEW } } });
    if (activeCount > 0) return { ok: false, error: "has_active_contacts", activeCount };

    await tx.contactBatch.delete({ where: { id } });
    return { ok: true };
  });
}

// A batch uploaded by an admin/superadmin is shared — any manager can pull
// from it. A batch a manager uploaded themselves stays private to them; no
// one else sees it in the queue (admins still see it in Загруженные базы).
function visibleQueueWhere(branchId: number, userId: number): Prisma.ContactWhereInput {
  return {
    branchId,
    status: ContactStatus.NEW,
    OR: [
      { batch: { uploadedBy: { role: { in: [Role.ADMIN, Role.SUPERADMIN] } } } },
      { batch: { uploadedById: userId } },
    ],
  };
}

// The page groups the whole queue by organization ИНН client-side, so it
// needs more than a page's worth at once. Capped to keep the payload bounded;
// the frontend flags when the queue is larger than the cap.
export const QUEUE_LIMIT = 3000;

export function listQueue(branchId: number, userId: number) {
  return prisma.contact.findMany({
    where: visibleQueueWhere(branchId, userId),
    include: contactInclude,
    orderBy: { createdAt: "asc" },
    take: QUEUE_LIMIT,
  });
}

export function listMine(branchId: number, userId: number) {
  return prisma.contact.findMany({
    where: {
      branchId,
      claimedById: userId,
      status: { in: [ContactStatus.IN_PROGRESS, ContactStatus.CALLBACK] },
    },
    include: contactInclude,
    orderBy: { claimedAt: "asc" },
  });
}

// Must apply the same visibility rule as the queue listing — otherwise a
// manager could claim straight off another manager's private batch by ID,
// bypassing the filter that keeps it out of their /contacts/queue view.
// Takes the same batch lock deleteBatch does, so a claim can't land in the
// gap between deleteBatch's active-contact check and its actual delete.
export async function claimContact(id: number, branchId: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.contact.findFirst({ where: { id, branchId }, select: { batchId: true } });
    if (!target) return null;
    await lockBatch(tx, target.batchId);

    const result = await tx.contact.updateMany({
      where: { id, ...visibleQueueWhere(branchId, userId) },
      data: { status: ContactStatus.IN_PROGRESS, claimedById: userId, claimedAt: new Date() },
    });
    if (result.count === 0) return null;
    return tx.contact.findUnique({ where: { id }, include: contactInclude });
  });
}

// Shared with claimNext below — serializes concurrent claim-next calls from
// the same user (e.g. React StrictMode's double mount-effect in dev, or a
// retried request) so they can't both see "no active contact yet" and each
// claim one, leaving the manager holding two IN_PROGRESS contacts from a
// single visual "Звонить!" click.
const USER_CLAIM_LOCK_NAMESPACE = 0x434c4149; // "CLAI"

async function lockUserClaim(tx: Prisma.TransactionClient, userId: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USER_CLAIM_LOCK_NAMESPACE}::int, ${userId}::int)`;
}

// Powers the "Звонить!" button — grabs the oldest unclaimed contact instead
// of making the manager pick one from a list. A handful of retries absorbs
// the race where two managers hit the button at the same instant; each
// retry just moves on to the next-oldest still-NEW contact.
//
// Idempotent by design: if the caller already has an unresolved contact
// (IN_PROGRESS or CALLBACK) — from a previous claim-next that was closed
// without an outcome, or from manually claiming off the queue list —
// that's returned as-is instead of claiming another one on top of it.
// Repeatedly opening/closing the card without resolving anything can no
// longer gradually drain the whole shared queue into one manager's pile.
export async function claimNext(branchId: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    await lockUserClaim(tx, userId);

    const current = await tx.contact.findFirst({
      where: { branchId, claimedById: userId, status: { in: [ContactStatus.IN_PROGRESS, ContactStatus.CALLBACK] } },
      include: contactInclude,
      orderBy: { claimedAt: "asc" },
    });
    if (current) return current;

    for (let attempt = 0; attempt < 5; attempt++) {
      const next = await tx.contact.findFirst({
        where: visibleQueueWhere(branchId, userId),
        orderBy: { createdAt: "asc" },
      });
      if (!next) return null;
      await lockBatch(tx, next.batchId);

      const result = await tx.contact.updateMany({
        where: { id: next.id, branchId, status: ContactStatus.NEW },
        data: { status: ContactStatus.IN_PROGRESS, claimedById: userId, claimedAt: new Date() },
      });
      if (result.count > 0) {
        return tx.contact.findUnique({ where: { id: next.id }, include: contactInclude });
      }
      // Someone else claimed `next` between the read and the write — retry.
    }
    return null;
  });
}

// Mirrors the frontend's frontend/src/lib/contactExtraInfo.ts label list —
// pulls just the birth date back out of the flattened extraInfo string so
// "В трубки" can save "ФИО, ДР" without the rest of the uploaded columns.
const BIRTH_DATE_LABELS = ["дата рождения", "день рождения", "др", "birth date", "birthday"];

function extractBirthDate(extraInfo: string | null): string | null {
  if (!extraInfo) return null;
  for (const part of extraInfo.split(";")) {
    const sep = part.indexOf(":");
    if (sep === -1) continue;
    const label = part.slice(0, sep).trim().toLowerCase();
    if (BIRTH_DATE_LABELS.includes(label)) {
      return part.slice(sep + 1).trim();
    }
  }
  return null;
}

// Appends the DaData lookup results the call card already fetched (org
// name + director's ФИО) onto the contact's extraInfo, so they persist on
// the "Доп. инфа из базы прозвона" block on the resulting trubka even
// after the call card itself is gone.
function appendDadataInfo(extraInfo: string | null, orgName?: string, managerName?: string): string | null {
  const additions: string[] = [];
  if (orgName?.trim()) additions.push(`Организация (Dadata): ${orgName.trim()}`);
  if (managerName?.trim()) additions.push(`Руководитель (Dadata): ${managerName.trim()}`);
  if (additions.length === 0) return extraInfo;
  return [extraInfo, ...additions].filter(Boolean).join("; ");
}

const OUTCOME_STATUSES: ContactStatus[] = [
  ContactStatus.NOT_REACHED,
  ContactStatus.DECLINED,
  ContactStatus.CALLBACK,
  ContactStatus.ANSWERING_MACHINE,
  ContactStatus.NOT_PUSHED,
  ContactStatus.SKIP_ON_CODE,
];

// Serializes concurrent setOutcome/convertToAppeal calls on the same
// contact: without this, two nearly-simultaneous requests (e.g. a double
// click, or a retried request) can both read the contact while it's still
// IN_PROGRESS and both proceed — for convertToAppeal that meant two Appeal
// rows for one contact. The lock is held for the rest of the transaction, so
// whichever request runs second sees the already-updated status.
const CONTACT_LOCK_NAMESPACE = 0x434f4e54; // "CONT"

async function lockContact(tx: Prisma.TransactionClient, contactId: number) {
  // pg_advisory_xact_lock returns void — $queryRaw can't deserialize that,
  // so this must be $executeRaw (no result set expected).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CONTACT_LOCK_NAMESPACE}::int, ${contactId}::int)`;
}

export async function setOutcome(
  id: number,
  branchId: number,
  userId: number,
  canActOnAnyContact: boolean,
  status: ContactStatus,
  resultNote: string | null
) {
  if (!OUTCOME_STATUSES.includes(status)) return { error: "invalid_status" as const };

  return prisma.$transaction(async (tx) => {
    await lockContact(tx, id);
    const where: Prisma.ContactWhereInput = canActOnAnyContact
      ? { id, branchId }
      : { id, branchId, claimedById: userId };
    const contact = await tx.contact.findFirst({ where });
    if (!contact) return { error: "not_found" as const };
    if (contact.status !== ContactStatus.IN_PROGRESS && contact.status !== ContactStatus.CALLBACK) {
      return { error: "already_finished" as const };
    }

    const updated = await tx.contact.update({
      where: { id },
      data: { status, resultNote },
      include: contactInclude,
    });
    return { contact: updated };
  });
}

// Returns a contact the caller has claimed back to the shared queue —
// clears the claim so someone else can pick it up. The alternative to
// resolving it via setOutcome/convertToAppeal, for when the manager decides
// this one genuinely isn't theirs to work (wrong number, not who they
// expected, etc.) rather than just closing the call card and leaving it
// claimed indefinitely with no outcome recorded at all.
export async function releaseContact(id: number, branchId: number, userId: number, canActOnAnyContact: boolean) {
  return prisma.$transaction(async (tx) => {
    await lockContact(tx, id);
    const where: Prisma.ContactWhereInput = canActOnAnyContact
      ? { id, branchId }
      : { id, branchId, claimedById: userId };
    const contact = await tx.contact.findFirst({ where });
    if (!contact) return { error: "not_found" as const };
    if (contact.status !== ContactStatus.IN_PROGRESS && contact.status !== ContactStatus.CALLBACK) {
      return { error: "already_finished" as const };
    }

    const updated = await tx.contact.update({
      where: { id },
      data: { status: ContactStatus.NEW, claimedById: null, claimedAt: null },
      include: contactInclude,
    });
    return { contact: updated };
  });
}

// ---------------------------------------------------------------------------
// Прозвон statistics — powers the "Прозвон" block on the Статистика page.
// ---------------------------------------------------------------------------

export interface ContactManagerStat {
  userId: number;
  fullName: string;
  reached: number;
  notReached: number;
  declined: number;
  callback: number;
  answeringMachine: number;
  notPushed: number;
  skipOnCode: number;
  // Every contact this manager took into work during the period, including
  // ones still IN_PROGRESS — sum of all dispositions plus in-progress.
  total: number;
}

export interface ContactRangeStats {
  // Live, branch-wide snapshot — independent of the selected period, so the
  // queue picture is always "right now" no matter what range is chosen.
  queueTotal: number;
  queueNew: number;
  queueInWork: number;
  // Scoped to the selected period, bucketed by claimedAt (when the manager
  // took the contact into work) — the only per-contact timestamp that marks
  // when the calling actually happened.
  reached: number;
  notReached: number;
  declined: number;
  callback: number;
  answeringMachine: number;
  notPushed: number;
  skipOnCode: number;
  // Contacts with a final disposition (everything except NEW/IN_PROGRESS/
  // CALLBACK, which aren't "done"). Denominator of the conversion rate.
  handled: number;
  byManager: ContactManagerStat[];
}

// `to` is exclusive (start of the day after the last day wanted), same
// convention as the appeals stats endpoint.
export async function getContactStatsForRange(
  branchId: number,
  from: Date,
  to: Date
): Promise<ContactRangeStats> {
  const rangeWhere: Prisma.ContactWhereInput = { branchId, claimedAt: { gte: from, lt: to } };

  const [statusGroups, managerGroups, liveGroups] = await Promise.all([
    prisma.contact.groupBy({ by: ["status"], where: rangeWhere, _count: { _all: true } }),
    prisma.contact.groupBy({ by: ["claimedById", "status"], where: rangeWhere, _count: { _all: true } }),
    prisma.contact.groupBy({ by: ["status"], where: { branchId }, _count: { _all: true } }),
  ]);

  const rangeCount = (s: ContactStatus) => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const reached = rangeCount(ContactStatus.REACHED);
  const notReached = rangeCount(ContactStatus.NOT_REACHED);
  const declined = rangeCount(ContactStatus.DECLINED);
  const callback = rangeCount(ContactStatus.CALLBACK);
  const answeringMachine = rangeCount(ContactStatus.ANSWERING_MACHINE);
  const notPushed = rangeCount(ContactStatus.NOT_PUSHED);
  const skipOnCode = rangeCount(ContactStatus.SKIP_ON_CODE);

  const liveCount = (s: ContactStatus) => liveGroups.find((g) => g.status === s)?._count._all ?? 0;
  const queueTotal = liveGroups.reduce((sum, g) => sum + g._count._all, 0);
  const queueNew = liveCount(ContactStatus.NEW);
  const queueInWork = liveCount(ContactStatus.IN_PROGRESS) + liveCount(ContactStatus.CALLBACK);

  // Only managers who took ≥1 contact into work during the period appear —
  // no zero-rows for the whole staff list (unlike По трубкам, where a full
  // leaderboard makes sense; here it would just be noise).
  const managerIds = [
    ...new Set(managerGroups.map((g) => g.claimedById).filter((id): id is number => id !== null)),
  ];
  const users = managerIds.length
    ? await prisma.user.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  const statByManager = new Map<number, ContactManagerStat>();
  for (const g of managerGroups) {
    if (g.claimedById === null) continue;
    const stat =
      statByManager.get(g.claimedById) ??
      {
        userId: g.claimedById,
        fullName: nameById.get(g.claimedById) ?? "—",
        reached: 0,
        notReached: 0,
        declined: 0,
        callback: 0,
        answeringMachine: 0,
        notPushed: 0,
        skipOnCode: 0,
        total: 0,
      };
    const c = g._count._all;
    if (g.status === ContactStatus.REACHED) stat.reached += c;
    else if (g.status === ContactStatus.NOT_REACHED) stat.notReached += c;
    else if (g.status === ContactStatus.DECLINED) stat.declined += c;
    else if (g.status === ContactStatus.CALLBACK) stat.callback += c;
    else if (g.status === ContactStatus.ANSWERING_MACHINE) stat.answeringMachine += c;
    else if (g.status === ContactStatus.NOT_PUSHED) stat.notPushed += c;
    else if (g.status === ContactStatus.SKIP_ON_CODE) stat.skipOnCode += c;
    // IN_PROGRESS contacts claimed in the period count toward `total` only.
    stat.total += c;
    statByManager.set(g.claimedById, stat);
  }

  const byManager = [...statByManager.values()].sort(
    (a, b) => b.reached - a.reached || b.total - a.total
  );

  return {
    queueTotal,
    queueNew,
    queueInWork,
    reached,
    notReached,
    declined,
    callback,
    answeringMachine,
    notPushed,
    skipOnCode,
    handled: reached + notReached + declined + answeringMachine + notPushed + skipOnCode,
    byManager,
  };
}

export async function convertToAppeal(
  id: number,
  branchId: number,
  userId: number,
  canActOnAnyContact: boolean,
  dep?: string,
  phone?: string,
  description?: string,
  orgName?: string,
  managerName?: string,
  // "код в:" from the call card → the appeal's reportedTime ("Время кода")
  // field, the same one the trubka edit window exposes.
  reportedTime?: string
) {
  return prisma.$transaction(async (tx) => {
    await lockContact(tx, id);
    const where: Prisma.ContactWhereInput = canActOnAnyContact
      ? { id, branchId }
      : { id, branchId, claimedById: userId };
    const contact = await tx.contact.findFirst({ where });
    if (!contact) return { error: "not_found" as const };
    if (contact.status !== ContactStatus.IN_PROGRESS && contact.status !== ContactStatus.CALLBACK) {
      return { error: "already_finished" as const };
    }

    const status = await getDefaultOptionValue(branchId, OptionField.STATUS);
    const birthDate = extractBirthDate(contact.extraInfo);
    const includesBirthDate = !!(birthDate && contact.fullName?.includes(birthDate));
    const clientData = [contact.fullName, includesBirthDate ? null : birthDate].filter(Boolean).join(", ") || undefined;
    // The manager may have tapped one of the extra "Доп. номера" tel: links
    // instead of the main number — that's the phone that actually got called,
    // so it's what the trubka should carry, not necessarily contact.phone.
    const appeal = await createAppeal(
      {
        branchId,
        operatorId: userId,
        phone: phone?.trim() || contact.phone,
        clientData,
        dep: dep || undefined,
        reportedTime: reportedTime?.trim() || undefined,
        description: description?.trim() || undefined,
        status,
      },
      tx
    );

    const updated = await tx.contact.update({
      where: { id },
      data: {
        status: ContactStatus.REACHED,
        appealId: appeal.id,
        extraInfo: appendDadataInfo(contact.extraInfo, orgName, managerName),
      },
      include: contactInclude,
    });

    return { contact: updated, appeal };
  });
}
