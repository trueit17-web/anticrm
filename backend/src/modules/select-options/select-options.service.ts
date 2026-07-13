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

export async function updateOption(
  id: number,
  branchId: number,
  data: { value?: string; color?: string | null; isDefault?: boolean }
) {
  const { isDefault, ...rest } = data;

  if (isDefault) {
    // At most one default per branch+field — look the option up first so we
    // know which field's other rows to clear.
    const existing = await prisma.selectOption.findFirst({ where: { id, branchId } });
    if (!existing) return null;

    await prisma.$transaction([
      prisma.selectOption.updateMany({
        where: { branchId, field: existing.field },
        data: { isDefault: false },
      }),
      prisma.selectOption.update({ where: { id }, data: { ...rest, isDefault: true } }),
    ]);
    return prisma.selectOption.findUnique({ where: { id } });
  }

  const result = await prisma.selectOption.updateMany({ where: { id, branchId }, data: { ...rest, isDefault } });
  if (result.count === 0) return null;
  return prisma.selectOption.findUnique({ where: { id } });
}

// Only meaningful for STATUS: the value new appeals get when none is passed
// explicitly. Returns undefined (not null) when nothing's configured, so
// callers can spread it straight into a Prisma `create()` — an undefined
// field is treated as "not provided" and falls back to the column default.
export async function getDefaultOptionValue(branchId: number, field: OptionField): Promise<string | undefined> {
  const opt = await prisma.selectOption.findFirst({ where: { branchId, field, isDefault: true } });
  return opt?.value;
}

export async function deleteOption(id: number, branchId: number) {
  const result = await prisma.selectOption.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}
