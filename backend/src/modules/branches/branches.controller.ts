import { Request, Response } from "express";
import { z } from "zod";
import { createBranch, deleteBranch, listAccessibleBranches, listBranches, updateBranch } from "./branches.service";

export async function listBranchesHandler(_req: Request, res: Response) {
  const branches = await listBranches();
  res.json({ branches });
}

// Every role calls this to know which branches they may switch into —
// SUPERADMIN gets all of them, everyone else gets their home branch plus
// whatever's been granted to them.
export async function listMyBranchesHandler(req: Request, res: Response) {
  const branches = await listAccessibleBranches(req.user!);
  res.json({ branches });
}

const nameSchema = z.object({ name: z.string().min(1) });

export async function createBranchHandler(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const branch = await createBranch(parsed.data.name);
  res.status(201).json({ branch });
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  contactsEnabled: z.boolean().optional(),
  dadataApiKey: z.string().nullable().optional(),
});

export async function updateBranchHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const data = { ...parsed.data };
  // An empty string from the form means "clear the override", not "set it
  // to an empty string".
  if (typeof data.dadataApiKey === "string") {
    data.dadataApiKey = data.dadataApiKey.trim() || null;
  }
  const branch = await updateBranch(id, data);
  if (!branch) {
    return res.status(404).json({ error: "Филиал не найден" });
  }
  res.json({ branch });
}

export async function deleteBranchHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const result = await deleteBranch(id);
  if (result.ok) return res.status(204).send();
  if (result.error === "not_found") {
    return res.status(404).json({ error: "Филиал не найден" });
  }
  const b = result.blockers;
  const parts: string[] = [];
  if (b.users > 0) parts.push(`пользователи: ${b.users}`);
  if (b.appeals > 0) parts.push(`трубки: ${b.appeals}`);
  if (b.contacts > 0) parts.push(`контакты «Прозвона»: ${b.contacts}`);
  return res.status(409).json({
    error: `Нельзя удалить филиал — в нём есть данные (${parts.join(", ")}). Сначала перенесите или удалите их.`,
  });
}
