import { Request, Response } from "express";
import { OptionField, Prisma } from "@prisma/client";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import { createOption, deleteOption, listOptions, updateOption } from "./select-options.service";

export async function listOptionsHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.json({ options: [] });
  }
  const options = await listOptions(branchId);
  res.json({ options });
}

const createSchema = z.object({
  field: z.nativeEnum(OptionField),
  value: z.string().min(1),
});

export async function createOptionHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  try {
    const option = await createOption(branchId, parsed.data.field, parsed.data.value);
    res.status(201).json({ option });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Такое значение уже есть в списке" });
    }
    throw err;
  }
}

const updateSchema = z.object({
  value: z.string().min(1).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Цвет должен быть в формате #rrggbb")
    .nullable()
    .optional(),
});

export async function updateOptionHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const option = await updateOption(id, branchId, parsed.data);
  if (!option) {
    return res.status(404).json({ error: "Значение не найдено" });
  }
  res.json({ option });
}

export async function deleteOptionHandler(req: Request, res: Response) {
  const branchId = resolveBranchId(req);
  if (branchId === null) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  const id = Number(req.params.id);
  const deleted = await deleteOption(id, branchId);
  if (!deleted) {
    return res.status(404).json({ error: "Значение не найдено" });
  }
  res.status(204).send();
}
