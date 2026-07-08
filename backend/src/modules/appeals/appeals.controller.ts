import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import {
  createAppeal,
  deleteAppeal,
  getAppeal,
  getAppealHistory,
  getDailyStats,
  getOperatorStats,
  listAppealsByDate,
  setSmsSent,
  updateAppealWithHistory,
} from "./appeals.service";

function parseDateParam(raw: unknown): Date {
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function listAppealsHandler(req: Request, res: Response) {
  const date = parseDateParam(req.query.date);
  const appeals = await listAppealsByDate(date);
  res.json({ appeals });
}

const createSchema = z.object({
  date: z.coerce.date().optional(),
  phone: z.string().min(1),
  intake: z.boolean().optional(),
  clientData: z.string().optional(),
  description: z.string().optional(),
  status: z.string().min(1).optional(),
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

const tagField = z.string().nullable().optional();

const updateSchema = z.object({
  date: z.coerce.date().optional(),
  phone: z.string().min(1).optional(),
  intake: z.boolean().optional(),
  clientData: z.string().optional(),
  description: z.string().optional(),
  status: z.string().min(1).optional(),
  gov: tagField,
  cb: tagField,
  fsb: tagField,
  closer: tagField,
});

// Госы/ЦБ/ФСБ/Закрыв/Статус are classification fields — only manager/admin
// may set them, regardless of who owns the appeal. Прием (intake) and phone/
// description/etc. stay open to any authenticated employee, same as СМС.
const RESTRICTED_FIELDS = ["gov", "cb", "fsb", "closer", "status"] as const;

export async function updateAppealHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await getAppeal(id);
  if (!existing) {
    return res.status(404).json({ error: "Трубка не найдена" });
  }

  // Any authenticated employee may edit any appeal's general fields.
  const isManagerOrAdmin = req.user!.role === Role.MANAGER || req.user!.role === Role.ADMIN;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  const data = { ...parsed.data };

  // Only manager/admin may set Госы/ЦБ/ФСБ/Закрыв, regardless of who owns the appeal.
  if (!isManagerOrAdmin) {
    for (const field of RESTRICTED_FIELDS) {
      delete data[field];
    }
  }

  const appeal = await updateAppealWithHistory(id, data, req.user!.id);
  res.json({ appeal });
}

export async function deleteAppealHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  await deleteAppeal(id);
  res.status(204).send();
}

const smsSchema = z.object({ sms: z.boolean() });

export async function setSmsHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await getAppeal(id);
  if (!existing) {
    return res.status(404).json({ error: "Трубка не найдена" });
  }

  const parsed = smsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  // Any authenticated employee may mark SMS sent/unsent on any appeal.
  const appeal = await setSmsSent(id, parsed.data.sms, req.user!.id);
  res.json({ appeal });
}

export async function getHistoryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const history = await getAppealHistory(id);
  res.json({ history });
}

export async function getStatsHandler(_req: Request, res: Response) {
  const [byOperator, byDate] = await Promise.all([getOperatorStats(), getDailyStats(30)]);
  res.json({ byOperator, byDate });
}
