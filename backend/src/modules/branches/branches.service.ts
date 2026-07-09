import { prisma } from "../../lib/prisma";

export function listBranches() {
  return prisma.branch.findMany({ orderBy: { name: "asc" } });
}

export function createBranch(name: string) {
  return prisma.branch.create({ data: { name } });
}
