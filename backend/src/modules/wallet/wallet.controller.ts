import { Request, Response } from "express";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import {
  createRecipient,
  deleteRecipient,
  DuplicateAddressError,
  getWalletConfig,
  getWalletStats,
  isWalletCountEnabled,
  listRecipients,
  setWalletAddress,
  updateRecipient,
} from "./wallet.service";

// Same exclusive-`to` convention as the appeals/contacts stats endpoints.
function parseRange(req: Request): { from: Date; to: Date } {
  const rawFrom = req.query.from;
  const rawTo = req.query.to;
  const from = typeof rawFrom === "string" ? new Date(rawFrom) : null;
  const to = typeof rawTo === "string" ? new Date(rawTo) : null;
  if (from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())) {
    return { from, to };
  }
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { from: start, to: end };
}

export async function getWalletConfigHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.json({ address: null, enabled: false, recipients: [] });
  const [config, recipients] = await Promise.all([getWalletConfig(branchId), listRecipients(branchId)]);
  res.json({ ...config, recipients });
}

const addressSchema = z.object({ address: z.string().trim().nullable().optional() });

export async function setWalletAddressHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы" });
  await setWalletAddress(branchId, parsed.data.address?.trim() || null);
  res.json(await getWalletConfig(branchId));
}

const recipientSchema = z.object({ address: z.string().trim().min(1), name: z.string().trim().min(1) });

export async function createRecipientHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const parsed = recipientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  try {
    const recipient = await createRecipient(branchId, parsed.data.address, parsed.data.name);
    res.status(201).json({ recipient });
  } catch (err) {
    if (err instanceof DuplicateAddressError) return res.status(409).json({ error: "Этот адрес уже добавлен" });
    throw err;
  }
}

const recipientUpdateSchema = z.object({
  address: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
});

export async function updateRecipientHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const id = Number(req.params.id);
  const parsed = recipientUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  try {
    const recipient = await updateRecipient(branchId, id, parsed.data);
    if (!recipient) return res.status(404).json({ error: "Запись не найдена" });
    res.json({ recipient });
  } catch (err) {
    if (err instanceof DuplicateAddressError) return res.status(409).json({ error: "Этот адрес уже добавлен" });
    throw err;
  }
}

export async function deleteRecipientHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const id = Number(req.params.id);
  const deleted = await deleteRecipient(branchId, id);
  if (!deleted) return res.status(404).json({ error: "Запись не найдена" });
  res.status(204).send();
}

export async function getWalletStatsHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.json({ address: null, total: 0, count: 0, byRecipient: [] });
  if (!(await isWalletCountEnabled(branchId))) {
    return res.status(403).json({ error: "Модуль «Считать кош» отключён для этого филиала" });
  }
  const { from, to } = parseRange(req);
  try {
    const stats = await getWalletStats(branchId, from, to);
    res.json(stats);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Не удалось получить данные из Tronscan" });
  }
}
