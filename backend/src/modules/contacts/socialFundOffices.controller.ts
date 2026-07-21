import { Request, Response } from "express";
import { z } from "zod";
import {
  countSocialFundOffices,
  createSocialFundOffice,
  deleteSocialFundOffice,
  DuplicateCityError,
  exportSocialFundOfficesCsv,
  listSocialFundOffices,
  lookupSocialFundAddress,
  updateSocialFundOffice,
} from "./socialFundOffices.service";

export async function listSocialFundOfficesHandler(_req: Request, res: Response) {
  const offices = await listSocialFundOffices();
  res.json({ offices });
}

// The admin page only shows a count + download link — the list itself can
// be thousands of rows, too many to usefully render.
export async function countSocialFundOfficesHandler(_req: Request, res: Response) {
  const count = await countSocialFundOffices();
  res.json({ count });
}

export async function exportSocialFundOfficesHandler(_req: Request, res: Response) {
  const csv = await exportSocialFundOfficesCsv();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sfr_offices.csv"');
  res.send(csv);
}

const createSchema = z.object({ city: z.string().min(1), address: z.string().min(1) });

export async function createSocialFundOfficeHandler(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  try {
    const office = await createSocialFundOffice(parsed.data.city.trim(), parsed.data.address.trim());
    res.status(201).json({ office });
  } catch (err) {
    if (err instanceof DuplicateCityError) {
      return res.status(409).json({ error: "Такой город уже есть в списке" });
    }
    throw err;
  }
}

const updateSchema = z.object({
  city: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
});

export async function updateSocialFundOfficeHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  try {
    const office = await updateSocialFundOffice(id, parsed.data);
    if (!office) return res.status(404).json({ error: "Запись не найдена" });
    res.json({ office });
  } catch (err) {
    if (err instanceof DuplicateCityError) {
      return res.status(409).json({ error: "Такой город уже есть в списке" });
    }
    throw err;
  }
}

export async function deleteSocialFundOfficeHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const deleted = await deleteSocialFundOffice(id);
  if (!deleted) return res.status(404).json({ error: "Запись не найдена" });
  res.status(204).send();
}

const lookupSchema = z.object({ address: z.string().min(1) });

export async function lookupSocialFundOfficeHandler(req: Request, res: Response) {
  const parsed = lookupSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Укажите адрес" });
  }
  const result = await lookupSocialFundAddress(parsed.data.address);
  res.json(result);
}
