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
