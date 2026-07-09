import { Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import { createUser, listUsers, updateUser } from "./users.service";

export async function listUsersHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  const users = await listUsers(branchId);
  res.json({ users });
}

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  fullName: z.string().min(1),
  role: z.nativeEnum(Role).default(Role.USER),
});

export async function createUserHandler(req: Request, res: Response) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  // Only a SUPERADMIN may mint another SUPERADMIN account.
  if (parsed.data.role === Role.SUPERADMIN && req.user!.role !== Role.SUPERADMIN) {
    return res.status(403).json({ error: "Недостаточно прав" });
  }

  // SUPERADMIN accounts aren't tied to a branch; every other role is
  // registered into whichever branch the request is scoped to.
  const branchId = parsed.data.role === Role.SUPERADMIN ? null : resolveBranchId(req);
  if (branchId === null && parsed.data.role !== Role.SUPERADMIN) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  try {
    const user = await createUser({ ...parsed.data, branchId });
    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Такой логин уже занят" });
    }
    throw err;
  }
}

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function updateUserHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  if (parsed.data.role === Role.SUPERADMIN && req.user!.role !== Role.SUPERADMIN) {
    return res.status(403).json({ error: "Недостаточно прав" });
  }

  const branchId = resolveBranchId(req);
  const user = await updateUser(id, branchId, parsed.data);
  if (!user) {
    return res.status(404).json({ error: "Пользователь не найден" });
  }
  res.json({ user });
}
