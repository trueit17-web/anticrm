import { Request, Response } from "express";
import { ContactStatus, Role } from "@prisma/client";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import { parseContactsFile } from "../../utils/parseContactsFile";
import {
  claimContact,
  convertToAppeal,
  createBatch,
  deleteBatch,
  listBatches,
  listMine,
  listQueue,
  setOutcome,
} from "./contacts.service";

// ADMIN/SUPERADMIN may act on any contact regardless of who claimed it;
// MANAGER is confined to contacts they claimed themselves.
function canActOnAnyContact(role: Role): boolean {
  return role === Role.ADMIN || role === Role.SUPERADMIN;
}

export async function uploadBatchHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Файл не передан" });
  }

  const rows = await parseContactsFile(file.buffer, file.originalname);
  if (rows.length === 0) {
    return res.status(400).json({ error: "В файле не найдено ни одного номера телефона" });
  }

  const batch = await createBatch(branchId, req.user!.id, file.originalname, rows);
  res.status(201).json({ batch });
}

export async function listBatchesHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ batches: [] });
  }
  const batches = await listBatches(branchId);
  res.json({ batches });
}

export async function deleteBatchHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const id = Number(req.params.id);
  const deleted = await deleteBatch(id, branchId);
  if (!deleted) {
    return res.status(404).json({ error: "База не найдена" });
  }
  res.status(204).send();
}

export async function listQueueHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ contacts: [] });
  }
  const contacts = await listQueue(branchId);
  res.json({ contacts });
}

export async function listMineHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ contacts: [] });
  }
  const contacts = await listMine(branchId, req.user!.id);
  res.json({ contacts });
}

export async function claimContactHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const id = Number(req.params.id);
  const contact = await claimContact(id, branchId, req.user!.id);
  if (!contact) {
    return res.status(409).json({ error: "Контакт уже взят в работу" });
  }
  res.json({ contact });
}

const outcomeSchema = z.object({
  status: z.enum(["NOT_REACHED", "DECLINED", "CALLBACK"]),
  resultNote: z.string().nullable().optional(),
});

export async function setOutcomeHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  const id = Number(req.params.id);
  const result = await setOutcome(
    id,
    branchId,
    req.user!.id,
    canActOnAnyContact(req.user!.role),
    parsed.data.status as ContactStatus,
    parsed.data.resultNote ?? null
  );
  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ error: "Контакт не найден" });
    return res.status(409).json({ error: "Контакт уже обработан" });
  }
  res.json({ contact: result.contact });
}

export async function convertToAppealHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const id = Number(req.params.id);
  const result = await convertToAppeal(id, branchId, req.user!.id, canActOnAnyContact(req.user!.role));
  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ error: "Контакт не найден" });
    return res.status(409).json({ error: "Контакт уже обработан" });
  }
  res.json({ contact: result.contact, appeal: result.appeal });
}
