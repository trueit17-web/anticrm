import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
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
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.json({ appeals: [] });
  }
  const date = parseDateParam(req.query.date);
  const appeals = await listAppealsByDate(branchId, date);
  res.json({ appeals });
}

const createSchema = z.object({
  date: z.coerce.date().optional(),
  phone: z.string().min(1),
  intake: z.boolean().optional(),
  clientData: z.string().optional(),
  dep: z.string().optional(),
  reportedTime: z.string().optional(),
  description: z.string().optional(),
  status: z.string().min(1).optional(),
});

export async function createAppealHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  const appeal = await createAppeal({
    ...parsed.data,
    branchId,
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
  dep: z.string().optional(),
  reportedTime: z.string().optional(),
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
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const id = Number(req.params.id);
  const existing = await getAppeal(id, branchId);
  if (!existing) {
    return res.status(404).json({ error: "Трубка не найдена" });
  }

  // Any authenticated employee may edit any appeal's general fields.
  const isManagerOrAdmin =
    req.user!.role === Role.MANAGER || req.user!.role === Role.ADMIN || req.user!.role === Role.SUPERADMIN;

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

  const appeal = await updateAppealWithHistory(id, branchId, data, req.user!.id);
  res.json({ appeal });
}

export async function deleteAppealHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const id = Number(req.params.id);
  const deleted = await deleteAppeal(id, branchId);
  if (!deleted) {
    return res.status(404).json({ error: "Трубка не найдена" });
  }
  res.status(204).send();
}

const smsSchema = z.object({ sms: z.boolean() });

export async function setSmsHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const id = Number(req.params.id);
  const parsed = smsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  // Any authenticated employee may mark SMS sent/unsent on any appeal.
  const appeal = await setSmsSent(id, branchId, parsed.data.sms, req.user!.id);
  if (!appeal) {
    return res.status(404).json({ error: "Трубка не найдена" });
  }
  res.json({ appeal });
}

export async function getHistoryHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const id = Number(req.params.id);
  const history = await getAppealHistory(id, branchId);
  if (history === null) {
    return res.status(404).json({ error: "Трубка не найдена" });
  }
  res.json({ history });
}

export async function getStatsHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.json({ byOperator: [], byDate: [] });
  }
  const [byOperator, byDate] = await Promise.all([getOperatorStats(branchId), getDailyStats(branchId, 30)]);
  res.json({ byOperator, byDate });
}
