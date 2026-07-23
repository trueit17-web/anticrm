import { ContactStatus, OptionField, Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { createAppeal } from "../appeals/appeals.service";
import { getDefaultOptionValue } from "../select-options/select-options.service";
import { ParsedContact } from "../../utils/parseContactsFile";

const batchInclude = {
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ContactBatchInclude;

const contactInclude = {
  claimedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ContactInclude;

export async function createBatch(
  branchId: number,
  uploadedById: number,
  fileName: string,
  rows: ParsedContact[]
) {
  const batch = await prisma.contactBatch.create({
    data: { branchId, uploadedById, fileName, totalCount: rows.length },
  });

  if (rows.length > 0) {
    await prisma.contact.createMany({
      data: rows.map((r) => ({
        branchId,
        batchId: batch.id,
        phone: r.phone,
        fullName: r.fullName ?? null,
        extraInfo: r.extraInfo ?? null,
      })),
    });
  }

  return prisma.contactBatch.findUnique({ where: { id: batch.id }, include: batchInclude });
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

export function listQueue(branchId: number, userId: number) {
  return prisma.contact.findMany({
    where: visibleQueueWhere(branchId, userId),
    include: contactInclude,
    orderBy: { createdAt: "asc" },
    take: 200,
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

// Powers the "Звонить!" button — grabs the oldest unclaimed contact instead
// of making the manager pick one from a list. A handful of retries absorbs
// the race where two managers hit the button at the same instant; each
// retry just moves on to the next-oldest still-NEW contact.
export async function claimNext(branchId: number, userId: number) {
  return prisma.$transaction(async (tx) => {
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

const OUTCOME_STATUSES: ContactStatus[] = [ContactStatus.NOT_REACHED, ContactStatus.DECLINED, ContactStatus.CALLBACK];

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

export async function convertToAppeal(
  id: number,
  branchId: number,
  userId: number,
  canActOnAnyContact: boolean,
  dep?: string,
  phone?: string,
  description?: string,
  orgName?: string,
  managerName?: string
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
