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
  branchAccess: { select: { branch: { select: { id: true, name: true } } } },
} as const;

function toUserSummary<T extends { branchAccess: { branch: { id: number; name: string } }[] }>(user: T) {
  return { ...user, branchAccess: user.branchAccess.map((a) => a.branch) };
}

// branchId === null means "no branch selected" (SUPERADMIN viewing across
// all branches) — list everyone in that case rather than nobody.
export async function listUsers(branchId: number | null) {
  const users = await prisma.user.findMany({
    where: branchId === null ? {} : { branchId },
    select: publicUserSelect,
    orderBy: { fullName: "asc" },
  });
  return users.map(toUserSummary);
}

export async function createUser(input: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchId: number | null;
}) {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      branchId: input.branchId,
    },
    select: publicUserSelect,
  });
  return toUserSummary(user);
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
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  return user ? toUserSummary(user) : null;
}
