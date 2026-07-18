import { Request, Response } from "express";
import { z } from "zod";
import { createBranch, listAccessibleBranches, listBranches, updateBranch } from "./branches.service";

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
});

export async function updateBranchHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const branch = await updateBranch(id, parsed.data);
  if (!branch) {
    return res.status(404).json({ error: "Филиал не найден" });
  }
  res.json({ branch });
}
