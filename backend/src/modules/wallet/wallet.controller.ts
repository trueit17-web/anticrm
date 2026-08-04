import { Request, Response } from "express";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import {
  addSource,
  createRecipient,
  deleteRecipient,
  deleteSource,
  DuplicateAddressError,
  getWalletConfig,
  getWalletStats,
  isWalletCountEnabled,
  listRecipients,
  setWalletConfig,
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
  if (branchId === null) return res.json({ sources: [], enabled: false, hasTronscanApiKey: false, recipients: [] });
  const [config, recipients] = await Promise.all([getWalletConfig(branchId), listRecipients(branchId)]);
  res.json({ ...config, recipients });
}

const configSchema = z.object({
  // string = set, null = clear, omitted = keep (write-only secret).
  tronscanApiKey: z.string().trim().nullable().optional(),
});

export async function setWalletConfigHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы" });
  const patch: { tronscanApiKey?: string | null } = {};
  if (parsed.data.tronscanApiKey !== undefined) patch.tronscanApiKey = parsed.data.tronscanApiKey?.trim() || null;
  await setWalletConfig(branchId, patch);
  res.json(await getWalletConfig(branchId));
}

const sourceSchema = z.object({ address: z.string().trim().min(1) });

export async function addSourceHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const parsed = sourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  try {
    const source = await addSource(branchId, parsed.data.address);
    res.status(201).json({ source });
  } catch (err) {
    if (err instanceof DuplicateAddressError) return res.status(409).json({ error: "Этот кошелёк уже добавлен" });
    throw err;
  }
}

export async function deleteSourceHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const id = Number(req.params.id);
  const deleted = await deleteSource(branchId, id);
  if (!deleted) return res.status(404).json({ error: "Кошелёк не найден" });
  res.status(204).send();
}

const recipientSchema = z.object({
  address: z.string().trim().min(1),
  name: z.string().trim().min(1),
  isHub: z.boolean().optional(),
});

export async function createRecipientHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const parsed = recipientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  try {
    const recipient = await createRecipient(branchId, parsed.data.address, parsed.data.name, parsed.data.isHub ?? false);
    res.status(201).json({ recipient });
  } catch (err) {
    if (err instanceof DuplicateAddressError) return res.status(409).json({ error: "Этот адрес уже добавлен" });
    throw err;
  }
}

const recipientUpdateSchema = z.object({
  address: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  isHub: z.boolean().optional(),
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
  if (branchId === null) return res.json({ sources: [], total: 0, count: 0, byRecipient: [], suggestedHubs: [] });
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
