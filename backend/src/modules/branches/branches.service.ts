import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";

// dadataApiKey is a secret — never select it into anything returned to a
// client. Endpoints that need to know only whether one is set use
// toPublicBranch below; the one place that needs the actual value
// (getDadataApiKey, used server-side to make the lookup request) selects it
// explicitly and never returns it.
const branchPublicSelect = {
  id: true,
  name: true,
  contactsEnabled: true,
  createdAt: true,
} satisfies Prisma.BranchSelect;

type PublicBranch = Prisma.BranchGetPayload<{ select: typeof branchPublicSelect }>;

function toPublicBranch(branch: PublicBranch & { dadataApiKey: string | null }) {
  const { dadataApiKey, ...rest } = branch;
  return { ...rest, hasDadataApiKey: !!dadataApiKey?.trim() };
}

// Branch ids that hold real data — home users, appeals (incl. trashed), or
// Прозвон contacts/bases. Such branches can't be deleted (see deleteBranch),
// so the Филиалы page hides the delete button for them (deletable=false).
async function branchIdsWithData(): Promise<Set<number>> {
  const [users, appeals, contacts, batches] = await Promise.all([
    prisma.user.findMany({ where: { branchId: { not: null } }, distinct: ["branchId"], select: { branchId: true } }),
    prisma.appeal.findMany({ distinct: ["branchId"], select: { branchId: true } }),
    prisma.contact.findMany({ distinct: ["branchId"], select: { branchId: true } }),
    prisma.contactBatch.findMany({ distinct: ["branchId"], select: { branchId: true } }),
  ]);
  const set = new Set<number>();
  for (const arr of [users, appeals, contacts, batches]) {
    for (const row of arr) if (row.branchId != null) set.add(row.branchId);
  }
  return set;
}

// Used by the SUPERADMIN-only Филиалы admin page — needs to show whether a
// branch-level key is set (never the key itself) and whether the branch is
// empty enough to be deleted.
export async function listBranches() {
  const branches = await prisma.branch.findMany({
    select: { ...branchPublicSelect, dadataApiKey: true },
    orderBy: { name: "asc" },
  });
  const nonEmpty = await branchIdsWithData();
  return branches.map((b) => ({ ...toPublicBranch(b), deletable: !nonEmpty.has(b.id) }));
}

export function createBranch(name: string) {
  return prisma.branch.create({ data: { name }, select: branchPublicSelect });
}

export async function updateBranch(
  id: number,
  data: { name?: string; contactsEnabled?: boolean; dadataApiKey?: string | null }
) {
  const result = await prisma.branch.updateMany({ where: { id }, data });
  if (result.count === 0) return null;
  const branch = await prisma.branch.findUnique({
    where: { id },
    select: { ...branchPublicSelect, dadataApiKey: true },
  });
  return branch ? toPublicBranch(branch) : null;
}

export type DeleteBranchResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "not_empty"; blockers: { users: number; appeals: number; contacts: number } };

// Deleting a branch is only allowed when it holds no real data — the FK
// constraints on User/Appeal/Contact are Restrict, and cascade-wiping people
// and trubki behind one button click would be far too easy to do by accident.
// So we refuse if any users (home branch), appeals (incl. trashed), or
// Прозвон contacts/bases exist, and tell the SUPERADMIN what to clear first.
// Only the config/join rows that are meaningless without the branch
// (select-options, branch-access grants) are removed automatically.
export async function deleteBranch(id: number): Promise<DeleteBranchResult> {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id }, select: { id: true } });
    if (!branch) return { ok: false, error: "not_found" };

    const [users, appeals, contacts, contactBatches] = await Promise.all([
      tx.user.count({ where: { branchId: id } }),
      tx.appeal.count({ where: { branchId: id } }),
      tx.contact.count({ where: { branchId: id } }),
      tx.contactBatch.count({ where: { branchId: id } }),
    ]);
    const contactsTotal = contacts + contactBatches;
    if (users > 0 || appeals > 0 || contactsTotal > 0) {
      return { ok: false, error: "not_empty", blockers: { users, appeals, contacts: contactsTotal } };
    }

    await tx.selectOption.deleteMany({ where: { branchId: id } });
    await tx.userBranchAccess.deleteMany({ where: { branchId: id } });
    await tx.branch.delete({ where: { id } });
    return { ok: true };
  });
}

// Gate checked by every /contacts route — a branch with the module off
// 403s the whole thing, not just a hidden nav icon.
export async function isContactsEnabled(branchId: number): Promise<boolean> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { contactsEnabled: true } });
  return branch?.contactsEnabled ?? false;
}

// The "ИНН ЮЛ → название организации" lookup's key — a branch may set its
// own via the Филиалы page; falls back to the global DADATA_API_KEY env var
// (e.g. for single-branch deployments) when the branch hasn't set one.
export async function getDadataApiKey(branchId: number): Promise<string | null> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { dadataApiKey: true } });
  return branch?.dadataApiKey?.trim() || process.env.DADATA_API_KEY || null;
}

// Branches the given user may switch into: every branch for SUPERADMIN,
// otherwise their home branch plus whatever's been granted to them. Powers
// the branch switcher for every role, so — unlike listBranches — this never
// includes even the hasDadataApiKey flag, just what's needed to switch.
export async function listAccessibleBranches(user: { id: number; role: Role; branchId: number | null }) {
  if (user.role === Role.SUPERADMIN) {
    return prisma.branch.findMany({ select: branchPublicSelect, orderBy: { name: "asc" } });
  }

  const grants = await prisma.userBranchAccess.findMany({
    where: { userId: user.id },
    select: { branch: { select: branchPublicSelect } },
  });
  const branches = grants.map((g) => g.branch);

  if (user.branchId && !branches.some((b) => b.id === user.branchId)) {
    const home = await prisma.branch.findUnique({ where: { id: user.branchId }, select: branchPublicSelect });
    if (home) branches.push(home);
  }

  return branches.sort((a, b) => a.name.localeCompare(b.name));
}

export function getUserBranchAccess(userId: number) {
  return prisma.userBranchAccess.findMany({
    where: { userId },
    include: { branch: true },
    orderBy: { branch: { name: "asc" } },
  });
}

export async function setUserBranchAccess(userId: number, branchIds: number[]) {
  await prisma.$transaction([
    prisma.userBranchAccess.deleteMany({ where: { userId } }),
    prisma.userBranchAccess.createMany({
      data: branchIds.map((branchId) => ({ userId, branchId })),
      skipDuplicates: true,
    }),
  ]);
  return getUserBranchAccess(userId);
}
