import { prisma } from "../../lib/prisma";

// Fixed set of client-side heuristics a rule can hang off. Kept in sync with
// the PetAssistant rule engine on the frontend.
export const PET_TRIGGERS = ["no_sms", "big_dep", "nedozhal", "stalled", "custom"] as const;
export type PetTrigger = (typeof PET_TRIGGERS)[number];

const DEFAULT_PROFILE = { name: "Кеша", skin: "fox", chattiness: 1 };

export async function isPetEnabled(branchId: number): Promise<boolean> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { petEnabled: true } });
  return b?.petEnabled ?? false;
}

export async function getPetConfig(branchId: number) {
  const [branch, profile, rules] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, select: { petEnabled: true } }),
    prisma.petProfile.findUnique({
      where: { branchId },
      select: { name: true, skin: true, chattiness: true },
    }),
    prisma.petRule.findMany({
      where: { branchId },
      orderBy: { createdAt: "asc" },
      select: { id: true, trigger: true, message: true, enabled: true },
    }),
  ]);
  return {
    enabled: branch?.petEnabled ?? false,
    profile: profile ?? DEFAULT_PROFILE,
    rules,
  };
}

export async function updateProfile(
  branchId: number,
  patch: { name?: string; skin?: string; chattiness?: number }
) {
  const profile = await prisma.petProfile.upsert({
    where: { branchId },
    create: { branchId, ...DEFAULT_PROFILE, ...patch },
    update: patch,
    select: { name: true, skin: true, chattiness: true },
  });
  return profile;
}

export function addRule(branchId: number, trigger: PetTrigger, message: string) {
  return prisma.petRule.create({
    data: { branchId, trigger, message },
    select: { id: true, trigger: true, message: true, enabled: true },
  });
}

export async function updateRule(
  branchId: number,
  id: number,
  patch: { trigger?: PetTrigger; message?: string; enabled?: boolean }
) {
  const result = await prisma.petRule.updateMany({ where: { id, branchId }, data: patch });
  if (result.count === 0) return null;
  return prisma.petRule.findUnique({
    where: { id },
    select: { id: true, trigger: true, message: true, enabled: true },
  });
}

export async function deleteRule(branchId: number, id: number) {
  const result = await prisma.petRule.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}
