import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../utils/password";

const publicUserSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  active: true,
  createdAt: true,
  branch: { select: { id: true, name: true } },
} as const;

// branchId === null means "no branch selected" (SUPERADMIN viewing across
// all branches) — list everyone in that case rather than nobody.
export function listUsers(branchId: number | null) {
  return prisma.user.findMany({
    where: branchId === null ? {} : { branchId },
    select: publicUserSelect,
    orderBy: { fullName: "asc" },
  });
}

export async function createUser(input: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchId: number | null;
}) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      branchId: input.branchId,
    },
    select: publicUserSelect,
  });
}

export async function updateUser(
  id: number,
  branchId: number | null,
  input: Partial<{ fullName: string; role: Role; active: boolean; password: string }>
) {
  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.role !== undefined) data.role = input.role;
  if (input.active !== undefined) data.active = input.active;
  if (input.password) data.passwordHash = await hashPassword(input.password);

  // branchId === null (SUPERADMIN, no branch selected) may edit anyone;
  // everyone else is confined to their own branch's accounts.
  const where = branchId === null ? { id } : { id, branchId };
  const result = await prisma.user.updateMany({ where, data });
  if (result.count === 0) return null;
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}
