import { Request, Response } from "express";
import { AppealStatus, IntakeChannel, Role } from "@prisma/client";
import { z } from "zod";
import {
  createAppeal,
  deleteAppeal,
  getAppeal,
  listAppeals,
  updateAppeal,
} from "./appeals.service";

export async function listAppealsHandler(_req: Request, res: Response) {
  const appeals = await listAppeals();
  res.json({ appeals });
}

const createSchema = z.object({
  date: z.coerce.date().optional(),
  phone: z.string().min(1),
  intake: z.nativeEnum(IntakeChannel).default(IntakeChannel.PHONE),
  clientData: z.string().optional(),
  description: z.string().optional(),
  status: z.nativeEnum(AppealStatus).optional(),
});

export async function createAppealHandler(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  const appeal = await createAppeal({
    ...parsed.data,
    operatorId: req.user!.id,
  });
  res.status(201).json({ appeal });
}

const assigneeField = z.number().int().positive().nullable().optional();

const updateSchema = z.object({
  date: z.coerce.date().optional(),
  phone: z.string().min(1).optional(),
  intake: z.nativeEnum(IntakeChannel).optional(),
  clientData: z.string().optional(),
  description: z.string().optional(),
  status: z.nativeEnum(AppealStatus).optional(),
  govAssigneeId: assigneeField,
  cbAssigneeId: assigneeField,
  fsbAssigneeId: assigneeField,
  closerAssigneeId: assigneeField,
});

const ASSIGNMENT_FIELDS = [
  "govAssigneeId",
  "cbAssigneeId",
  "fsbAssigneeId",
  "closerAssigneeId",
] as const;

export async function updateAppealHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await getAppeal(id);
  if (!existing) {
    return res.status(404).json({ error: "Обращение не найдено" });
  }

  const isOwner = existing.operatorId === req.user!.id;
  const isManagerOrAdmin = req.user!.role === Role.MANAGER || req.user!.role === Role.ADMIN;

  if (!isOwner && !isManagerOrAdmin) {
    return res.status(403).json({ error: "Можно редактировать только свои обращения" });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  const data = { ...parsed.data };

  // Assignment fields (who handles Госы/ЦБ/ФСБ/Закрыв) are set only by manager/admin,
  // regardless of who owns the appeal.
  if (!isManagerOrAdmin) {
    for (const field of ASSIGNMENT_FIELDS) {
      delete data[field];
    }
  }

  const appeal = await updateAppeal(id, data);
  res.json({ appeal });
}

export async function deleteAppealHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  await deleteAppeal(id);
  res.status(204).send();
}
