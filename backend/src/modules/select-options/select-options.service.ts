import { OptionField } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export function listOptions(branchId: number) {
  return prisma.selectOption.findMany({
    where: { branchId },
    orderBy: [{ field: "asc" }, { order: "asc" }, { id: "asc" }],
  });
}

export async function createOption(branchId: number, field: OptionField, value: string) {
  const last = await prisma.selectOption.findFirst({
    where: { branchId, field },
    orderBy: { order: "desc" },
  });
  return prisma.selectOption.create({
    data: { branchId, field, value, order: (last?.order ?? -1) + 1 },
  });
}

export async function updateOption(id: number, branchId: number, data: { value?: string; color?: string | null }) {
  const result = await prisma.selectOption.updateMany({ where: { id, branchId }, data });
  if (result.count === 0) return null;
  return prisma.selectOption.findUnique({ where: { id } });
}

export async function deleteOption(id: number, branchId: number) {
  const result = await prisma.selectOption.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}
