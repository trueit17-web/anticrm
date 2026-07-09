import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export function listBranches() {
  return prisma.branch.findMany({ orderBy: { name: "asc" } });
}

export function createBranch(name: string) {
  return prisma.branch.create({ data: { name } });
}

export async function updateBranch(id: number, name: string) {
  const result = await prisma.branch.updateMany({ where: { id }, data: { name } });
  if (result.count === 0) return null;
  return prisma.branch.findUnique({ where: { id } });
}

// Branches the given user may switch into: every branch for SUPERADMIN,
// otherwise their home branch plus whatever's been granted to them.
export async function listAccessibleBranches(user: { id: number; role: Role; branchId: number | null }) {
  if (user.role === Role.SUPERADMIN) {
    return listBranches();
  }

  const grants = await prisma.userBranchAccess.findMany({
    where: { userId: user.id },
    include: { branch: true },
  });
  const branches = grants.map((g) => g.branch);

  if (user.branchId && !branches.some((b) => b.id === user.branchId)) {
    const home = await prisma.branch.findUnique({ where: { id: user.branchId } });
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
