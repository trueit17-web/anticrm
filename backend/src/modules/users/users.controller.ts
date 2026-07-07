import { Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { createUser, listUsers, updateUser } from "./users.service";

export async function listUsersHandler(_req: Request, res: Response) {
  const users = await listUsers();
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

  try {
    const user = await createUser(parsed.data);
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

  const user = await updateUser(id, parsed.data);
  res.json({ user });
}
