import { Request, Response } from "express";
import { z } from "zod";
import { createBranch, listBranches } from "./branches.service";

export async function listBranchesHandler(_req: Request, res: Response) {
  const branches = await listBranches();
  res.json({ branches });
}

const createSchema = z.object({ name: z.string().min(1) });

export async function createBranchHandler(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const branch = await createBranch(parsed.data.name);
  res.status(201).json({ branch });
}
