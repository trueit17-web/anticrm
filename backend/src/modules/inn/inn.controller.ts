import { Request, Response } from "express";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import { getDadataApiKey } from "../branches/branches.service";
import { lookupOrganizationByInn } from "../../utils/dadataLookup";
import {
  adminUpdateInnEntry,
  createInnEntry,
  deleteInnEntry,
  getInnStatsSummary,
  getMyInnStats,
  getOperatorInnEntries,
  listBranchInnEntries,
  listMyInnEntries,
  previewInnWarning,
  refreshInnEntryFromDadata,
  searchInnEntry,
  updateInnEntry,
} from "./inn.service";

function parseDateParam(raw: unknown): Date {
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function parseRangeParams(req: Request): { from: Date; to: Date } {
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

export async function listMyInnEntriesHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ entries: [] });
  }
  const date = parseDateParam(req.query.date);
  const entries = await listMyInnEntries(branchId, req.user!.id, date);
  res.json({ entries });
}

const createSchema = z.object({
  date: z.coerce.date().optional(),
  inn: z.string().trim().min(1).max(20),
  contactsCount: z.number().int().min(0).default(0),
  transferredCount: z.number().int().min(0).default(0),
  called: z.boolean().default(false),
});

export async function createInnEntryHandler(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const entry = await createInnEntry({
    branchId,
    operatorId: req.user!.id,
    date: parsed.data.date ?? new Date(),
    inn: parsed.data.inn,
    contactsCount: parsed.data.contactsCount,
    transferredCount: parsed.data.transferredCount,
    called: parsed.data.called,
  });
  res.status(201).json({ entry });
}

const updateSchema = z.object({
  inn: z.string().trim().min(1).max(20).optional(),
  contactsCount: z.number().int().min(0).optional(),
  transferredCount: z.number().int().min(0).optional(),
  called: z.boolean().optional(),
});

export async function updateInnEntryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const entry = await updateInnEntry({ id, branchId, operatorId: req.user!.id, data: parsed.data });
  if (!entry) {
    return res.status(404).json({ error: "Запись не найдена" });
  }
  res.json({ entry });
}

export async function deleteInnEntryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const ok = await deleteInnEntry(id, branchId, req.user!.id);
  if (!ok) {
    return res.status(404).json({ error: "Запись не найдена" });
  }
  res.status(204).end();
}

const lookupSchema = z.object({ inn: z.string().min(1) });

// Live preview of название/регион while the operator is still typing —
// never errors out to the client, same contract as contacts' lookup-org.
export async function lookupInnHandler(req: Request, res: Response) {
  const parsed = lookupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Укажите ИНН" });
  }
  const branchId = await resolveBranchId(req);
  const apiKey = branchId !== null ? await getDadataApiKey(branchId) : process.env.DADATA_API_KEY || null;
  const result = await lookupOrganizationByInn(parsed.data.inn.trim(), apiKey);
  res.json(result);
}

export async function getMyInnStatsHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ totalEntries: 0, totalContacts: 0, totalTransferred: 0, totalCalled: 0 });
  }
  const { from, to } = parseRangeParams(req);
  const stats = await getMyInnStats(branchId, req.user!.id, from, to);
  res.json(stats);
}

export async function getInnStatsHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({
      totalEntries: 0,
      totalContacts: 0,
      totalTransferred: 0,
      totalRepeats: 0,
      totalCalled: 0,
      byOperator: [],
    });
  }
  const { from, to } = parseRangeParams(req);
  const stats = await getInnStatsSummary(branchId, from, to);
  res.json(stats);
}

const checkSchema = z.object({ inn: z.string().min(1), date: z.coerce.date().optional() });

// Pre-save "have we seen this ИНН recently" preview — the frontend calls
// this before create/update and, if it comes back with a warningLevel,
// confirms with the operator before actually saving.
export async function checkInnHandler(req: Request, res: Response) {
  const parsed = checkSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Укажите ИНН" });
  }
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ warningLevel: null, lastDate: null });
  }
  const result = await previewInnWarning(branchId, parsed.data.inn.trim(), parsed.data.date ?? new Date());
  res.json(result);
}

const searchSchema = z.object({ inn: z.string().min(1) });

// Search box in the drawer: finds the operator's own most recent matching
// row across any date and tells the frontend which date to jump the
// drawer's date picker to and which row to highlight there.
export async function searchInnEntryHandler(req: Request, res: Response) {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Укажите ИНН" });
  }
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ entry: null });
  }
  const entry = await searchInnEntry(branchId, req.user!.id, parsed.data.inn.trim());
  res.json({ entry });
}

export async function getOperatorInnEntriesHandler(req: Request, res: Response) {
  const operatorId = Number(req.params.operatorId);
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ entries: [] });
  }
  const { from, to } = parseRangeParams(req);
  const entries = await getOperatorInnEntries(branchId, operatorId, from, to);
  res.json({ entries });
}

// Flat, ungrouped list for the "массовое редактирование" view — every entry
// in the branch for the period, across every operator.
export async function listBranchInnEntriesHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ entries: [] });
  }
  const { from, to } = parseRangeParams(req);
  const entries = await listBranchInnEntries(branchId, from, to);
  res.json({ entries });
}

// ИНН is deliberately excluded — editing it would need a fresh dadata
// lookup and repeat-warning check, which doesn't fit this "fix up already
// -imported data" surface. Everything else about the row is fair game,
// including the date (unlike the personal drawer's own PATCH).
const adminUpdateSchema = z.object({
  companyName: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  date: z.coerce.date().optional(),
  contactsCount: z.number().int().min(0).optional(),
  transferredCount: z.number().int().min(0).optional(),
  called: z.boolean().optional(),
});

export async function adminUpdateInnEntryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const entry = await adminUpdateInnEntry({ id, branchId, data: parsed.data });
  if (!entry) {
    return res.status(404).json({ error: "Запись не найдена" });
  }
  res.json({ entry });
}

export async function refreshInnEntryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const entry = await refreshInnEntryFromDadata(id, branchId);
  if (!entry) {
    return res.status(404).json({ error: "Запись не найдена" });
  }
  res.json({ entry });
}
