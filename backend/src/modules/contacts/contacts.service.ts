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

export async function deleteBatch(id: number, branchId: number) {
  const result = await prisma.contactBatch.deleteMany({ where: { id, branchId } });
  return result.count > 0;
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

export async function claimContact(id: number, branchId: number, userId: number) {
  const result = await prisma.contact.updateMany({
    where: { id, branchId, status: ContactStatus.NEW },
    data: { status: ContactStatus.IN_PROGRESS, claimedById: userId, claimedAt: new Date() },
  });
  if (result.count === 0) return null;
  return prisma.contact.findUnique({ where: { id }, include: contactInclude });
}

// Powers the "Звонить!" button — grabs the oldest unclaimed contact instead
// of making the manager pick one from a list. A handful of retries absorbs
// the race where two managers hit the button at the same instant; each
// retry just moves on to the next-oldest still-NEW contact.
export async function claimNext(branchId: number, userId: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await prisma.contact.findFirst({
      where: visibleQueueWhere(branchId, userId),
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;

    const result = await prisma.contact.updateMany({
      where: { id: next.id, branchId, status: ContactStatus.NEW },
      data: { status: ContactStatus.IN_PROGRESS, claimedById: userId, claimedAt: new Date() },
    });
    if (result.count > 0) {
      return prisma.contact.findUnique({ where: { id: next.id }, include: contactInclude });
    }
    // Someone else claimed `next` between the read and the write — retry.
  }
  return null;
}

const OUTCOME_STATUSES: ContactStatus[] = [ContactStatus.NOT_REACHED, ContactStatus.DECLINED, ContactStatus.CALLBACK];

export async function setOutcome(
  id: number,
  branchId: number,
  userId: number,
  canActOnAnyContact: boolean,
  status: ContactStatus,
  resultNote: string | null
) {
  if (!OUTCOME_STATUSES.includes(status)) return { error: "invalid_status" as const };

  const where: Prisma.ContactWhereInput = canActOnAnyContact
    ? { id, branchId }
    : { id, branchId, claimedById: userId };
  const contact = await prisma.contact.findFirst({ where });
  if (!contact) return { error: "not_found" as const };
  if (contact.status !== ContactStatus.IN_PROGRESS && contact.status !== ContactStatus.CALLBACK) {
    return { error: "already_finished" as const };
  }

  const updated = await prisma.contact.update({
    where: { id },
    data: { status, resultNote },
    include: contactInclude,
  });
  return { contact: updated };
}

export async function convertToAppeal(
  id: number,
  branchId: number,
  userId: number,
  canActOnAnyContact: boolean,
  dep?: string
) {
  const where: Prisma.ContactWhereInput = canActOnAnyContact
    ? { id, branchId }
    : { id, branchId, claimedById: userId };
  const contact = await prisma.contact.findFirst({ where });
  if (!contact) return { error: "not_found" as const };
  if (contact.status !== ContactStatus.IN_PROGRESS && contact.status !== ContactStatus.CALLBACK) {
    return { error: "already_finished" as const };
  }

  const status = await getDefaultOptionValue(branchId, OptionField.STATUS);
  const clientData = [contact.fullName, contact.extraInfo].filter(Boolean).join(" — ") || undefined;
  const appeal = await createAppeal({
    branchId,
    operatorId: userId,
    phone: contact.phone,
    clientData,
    dep: dep || undefined,
    status,
  });

  const updated = await prisma.contact.update({
    where: { id },
    data: { status: ContactStatus.REACHED, appealId: appeal.id },
    include: contactInclude,
  });

  return { contact: updated, appeal };
}
