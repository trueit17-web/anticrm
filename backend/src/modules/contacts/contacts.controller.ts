import { Request, Response } from "express";
import { ContactStatus, Role } from "@prisma/client";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import { parseContactsFile } from "../../utils/parseContactsFile";
import { lookupOrganizationByInn } from "../../utils/dadataLookup";
import { getDadataApiKey } from "../branches/branches.service";
import {
  claimContact,
  claimNext,
  convertToAppeal,
  createBatch,
  deleteBatch,
  listBatches,
  listMine,
  listQueue,
  releaseContact,
  setOutcome,
} from "./contacts.service";

// ADMIN/SUPERADMIN may act on any contact regardless of who claimed it;
// MANAGER is confined to contacts they claimed themselves.
function canActOnAnyContact(role: Role): boolean {
  return role === Role.ADMIN || role === Role.SUPERADMIN;
}

// multer/busboy decode multipart filenames as latin1, which turns any
// non-ASCII name (e.g. Cyrillic) into mojibake — re-interpreting those bytes
// as UTF-8 recovers the original text. A no-op for plain ASCII filenames.
function fixFilenameEncoding(name: string): string {
  return Buffer.from(name, "latin1").toString("utf8");
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
  const fileName = fixFilenameEncoding(file.originalname);

  const rows = await parseContactsFile(file.buffer, fileName);
  if (rows.length === 0) {
    return res.status(400).json({ error: "В файле не найдено ни одного номера телефона" });
  }

  const batch = await createBatch(branchId, req.user!.id, fileName, rows);
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
  const result = await deleteBatch(id, branchId);
  if (!result.ok) {
    if (result.error === "not_found") {
      return res.status(404).json({ error: "База не найдена" });
    }
    return res.status(409).json({
      error: `В базе есть ${result.activeCount} контакт(ов) в работе или уже обработанных — удаление отменено`,
      activeCount: result.activeCount,
    });
  }
  res.status(204).send();
}

export async function listQueueHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({ contacts: [] });
  }
  const contacts = await listQueue(branchId, req.user!.id);
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

// Powers the "Звонить!" button — claims the oldest queued contact instead
// of the manager picking one from a list.
export async function claimNextHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const contact = await claimNext(branchId, req.user!.id);
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

export async function releaseContactHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const id = Number(req.params.id);
  const result = await releaseContact(id, branchId, req.user!.id, canActOnAnyContact(req.user!.role));
  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ error: "Контакт не найден" });
    return res.status(409).json({ error: "Контакт уже обработан" });
  }
  res.json({ contact: result.contact });
}

const convertSchema = z.object({
  dep: z.string().optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  orgName: z.string().optional(),
  managerName: z.string().optional(),
});

export async function convertToAppealHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }
  const parsed = convertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  const id = Number(req.params.id);
  const result = await convertToAppeal(
    id,
    branchId,
    req.user!.id,
    canActOnAnyContact(req.user!.role),
    parsed.data.dep,
    parsed.data.phone,
    parsed.data.description,
    parsed.data.orgName,
    parsed.data.managerName
  );
  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ error: "Контакт не найден" });
    return res.status(409).json({ error: "Контакт уже обработан" });
  }
  res.json({ contact: result.contact, appeal: result.appeal });
}

const lookupOrgSchema = z.object({ inn: z.string().min(1) });

// Powers the call card's "ИНН ЮЛ → название организации, руководитель"
// line — looks the INN up via DaData. Never errors out to the client: no
// API key or a failed lookup both just come back as nulls, since this is a
// nice-to-have on top of the manually uploaded client data, not something
// the rest of the card should depend on.
export async function lookupOrgHandler(req: Request, res: Response) {
  const parsed = lookupOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Укажите ИНН" });
  }
  const branchId = await resolveBranchId(req);
  const apiKey = branchId !== null ? await getDadataApiKey(branchId) : process.env.DADATA_API_KEY || null;
  const result = await lookupOrganizationByInn(parsed.data.inn.trim(), apiKey);
  res.json(result);
}
