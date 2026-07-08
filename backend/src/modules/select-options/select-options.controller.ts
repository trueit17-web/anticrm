import { Request, Response } from "express";
import { OptionField, Prisma } from "@prisma/client";
import { z } from "zod";
import { createOption, deleteOption, listOptions, updateOption } from "./select-options.service";

export async function listOptionsHandler(_req: Request, res: Response) {
  const options = await listOptions();
  res.json({ options });
}

const createSchema = z.object({
  field: z.nativeEnum(OptionField),
  value: z.string().min(1),
});

export async function createOptionHandler(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  try {
    const option = await createOption(parsed.data.field, parsed.data.value);
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
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const option = await updateOption(id, parsed.data);
  res.json({ option });
}

export async function deleteOptionHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  await deleteOption(id);
  res.status(204).send();
}
