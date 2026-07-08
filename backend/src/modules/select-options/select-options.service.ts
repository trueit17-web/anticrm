import { OptionField } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export function listOptions() {
  return prisma.selectOption.findMany({ orderBy: [{ field: "asc" }, { order: "asc" }, { id: "asc" }] });
}

export async function createOption(field: OptionField, value: string) {
  const last = await prisma.selectOption.findFirst({
    where: { field },
    orderBy: { order: "desc" },
  });
  return prisma.selectOption.create({
    data: { field, value, order: (last?.order ?? -1) + 1 },
  });
}

export function updateOption(id: number, value: string) {
  return prisma.selectOption.update({ where: { id }, data: { value } });
}

export function deleteOption(id: number) {
  return prisma.selectOption.delete({ where: { id } });
}
