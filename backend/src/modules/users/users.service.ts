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
} as const;

export function listUsers() {
  return prisma.user.findMany({
    select: publicUserSelect,
    orderBy: { fullName: "asc" },
  });
}

export async function createUser(input: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
}) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
    },
    select: publicUserSelect,
  });
}

export async function updateUser(
  id: number,
  input: Partial<{ fullName: string; role: Role; active: boolean; password: string }>
) {
  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.role !== undefined) data.role = input.role;
  if (input.active !== undefined) data.active = input.active;
  if (input.password) data.passwordHash = await hashPassword(input.password);

  return prisma.user.update({
    where: { id },
    data,
    select: publicUserSelect,
  });
}
