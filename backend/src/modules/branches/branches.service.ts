import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { recordAdminChange } from "../adminLog/adminLog.service";

const BRANCH_FIELD_LABELS: Record<string, string> = {
  name: "Название",
  contactsEnabled: "Модуль «Прозвон»",
  walletCountEnabled: "Модуль «Считать кош»",
  petEnabled: "Модуль «Питомец»",
  innEnabled: "Модуль «ИНН»",
  dadataApiKey: "Ключ dadata",
};

// dadataApiKey is a secret — never select it into anything returned to a
// client. Endpoints that need to know only whether one is set use
// toPublicBranch below; the one place that needs the actual value
// (getDadataApiKey, used server-side to make the lookup request) selects it
// explicitly and never returns it.
const branchPublicSelect = {
  id: true,
  name: true,
  contactsEnabled: true,
  walletCountEnabled: true,
  petEnabled: true,
  innEnabled: true,
  createdAt: true,
} satisfies Prisma.BranchSelect;

type PublicBranch = Prisma.BranchGetPayload<{ select: typeof branchPublicSelect }>;

function toPublicBranch(branch: PublicBranch & { dadataApiKey: string | null }) {
  const { dadataApiKey, ...rest } = branch;
  return { ...rest, hasDadataApiKey: !!dadataApiKey?.trim() };
}

// Used by the SUPERADMIN-only Филиалы admin page — needs to show whether a
// branch-level key is set, but never the key itself.
export async function listBranches() {
  const branches = await prisma.branch.findMany({
    select: { ...branchPublicSelect, dadataApiKey: true },
    orderBy: { name: "asc" },
  });
  return branches.map(toPublicBranch);
}

export async function createBranch(name: string, createdById: number) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({ data: { name }, select: branchPublicSelect });
    await recordAdminChange(tx, "branch", branch.id, branch.name, {}, { name }, createdById, BRANCH_FIELD_LABELS);
    return branch;
  });
}

export async function updateBranch(
  id: number,
  data: {
    name?: string;
    contactsEnabled?: boolean;
    walletCountEnabled?: boolean;
    petEnabled?: boolean;
    innEnabled?: boolean;
    dadataApiKey?: string | null;
  },
  changedById: number
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.branch.findUnique({
      where: { id },
      select: { ...branchPublicSelect, dadataApiKey: true },
    });
    if (!before) return null;

    const result = await tx.branch.updateMany({ where: { id }, data });
    if (result.count === 0) return null;
    const branch = await tx.branch.findUnique({
      where: { id },
      select: { ...branchPublicSelect, dadataApiKey: true },
    });
    if (!branch) return null;

    await recordAdminChange(
      tx,
      "branch",
      id,
      branch.name,
      before,
      data,
      changedById,
      BRANCH_FIELD_LABELS,
      new Set(["dadataApiKey"])
    );

    return toPublicBranch(branch);
  });
}

// Gate checked by every /contacts route — a branch with the module off
// 403s the whole thing, not just a hidden nav icon.
export async function isContactsEnabled(branchId: number): Promise<boolean> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { contactsEnabled: true } });
  return branch?.contactsEnabled ?? false;
}

// Gate checked by every /inn route — a branch with the module off 403s the
// whole thing, not just a hidden dock icon.
export async function isInnEnabled(branchId: number): Promise<boolean> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { innEnabled: true } });
  return branch?.innEnabled ?? false;
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
