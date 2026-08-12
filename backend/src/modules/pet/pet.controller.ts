import { Request, Response } from "express";
import { z } from "zod";
import { resolveBranchId } from "../../utils/branchScope";
import {
  addRule,
  deleteRule,
  getAiTips,
  getPetConfig,
  PARAM_TRIGGERS,
  PET_TRIGGERS,
  updateProfile,
  updateRule,
} from "./pet.service";

// Read by every authenticated role — the operator's page needs to know
// whether the pet is on, its look, and its rules to render the overlay.
export async function getPetConfigHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) {
    return res.json({
      enabled: false,
      profile: { name: "Кеша", skin: "fox", chattiness: 1, aiEnabled: false, hasOpenRouterApiKey: false },
      rules: [],
    });
  }
  res.json(await getPetConfig(branchId));
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(24).optional(),
  skin: z.enum(["fox", "robot", "frog", "cat"]).optional(),
  chattiness: z.number().int().min(0).max(2).optional(),
  aiEnabled: z.boolean().optional(),
  // string = set, null = clear, omitted = keep (write-only secret).
  openRouterApiKey: z.string().trim().nullable().optional(),
});

export async function updateProfileHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  const { openRouterApiKey, ...rest } = parsed.data;
  const patch: Parameters<typeof updateProfile>[1] = { ...rest };
  if (openRouterApiKey !== undefined) patch.openRouterApiKey = openRouterApiKey?.trim() || null;
  res.json({ profile: await updateProfile(branchId, patch) });
}

// Stage 5: a couple of AI-generated tips based on obscured shift aggregates
// (no client/operator data leaves the server) — see getAiTips for the shape.
// Silent no-op (empty array) when the module/AI is off or the request fails;
// the rule engine covers the gap, so this endpoint never needs to error out.
export async function getAiTipsHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.json({ tips: [] });
  res.json({ tips: await getAiTips(branchId) });
}

const ruleSchema = z.object({
  trigger: z.enum(PET_TRIGGERS),
  param: z.string().trim().min(1).max(60).nullable().optional(),
  message: z.string().trim().min(1).max(200),
});

export async function addRuleHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  if (PARAM_TRIGGERS.includes(parsed.data.trigger) && !parsed.data.param) {
    return res.status(400).json({ error: "Для этого условия укажите значение (статус, число или оператора)" });
  }
  const rule = await addRule(branchId, parsed.data.trigger, parsed.data.message, parsed.data.param ?? null);
  res.status(201).json({ rule });
}

const ruleUpdateSchema = z.object({
  trigger: z.enum(PET_TRIGGERS).optional(),
  param: z.string().trim().min(1).max(60).nullable().optional(),
  message: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
});

export async function updateRuleHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const id = Number(req.params.id);
  const parsed = ruleUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  const rule = await updateRule(branchId, id, parsed.data);
  if (!rule) return res.status(404).json({ error: "Правило не найдено" });
  res.json({ rule });
}

export async function deleteRuleHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  if (branchId === null) return res.status(400).json({ error: "Выберите филиал" });
  const id = Number(req.params.id);
  const deleted = await deleteRule(branchId, id);
  if (!deleted) return res.status(404).json({ error: "Правило не найдено" });
  res.status(204).send();
}
