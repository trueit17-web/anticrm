import { prisma } from "../../lib/prisma";

// Fixed set of client-side heuristics a rule can hang off. Kept in sync with
// the PetAssistant rule engine on the frontend.
export const PET_TRIGGERS = [
  "no_sms",
  "big_dep",
  "nedozhal",
  "stalled",
  "status",
  "daily_count",
  "phone_operator",
  "custom",
] as const;
export type PetTrigger = (typeof PET_TRIGGERS)[number];

// Triggers that carry a value in `param` (a status name, a count threshold, a
// carrier). Everything else stores null.
export const PARAM_TRIGGERS: readonly PetTrigger[] = ["status", "daily_count", "phone_operator"];

const DEFAULT_PROFILE = { name: "Кеша", skin: "fox", chattiness: 1 };
const DEFAULT_AI_PROFILE_FIELDS = { aiEnabled: false, hasOpenRouterApiKey: false };

// The starter rules every branch gets — materialized as ordinary PetRule rows
// (once) so admins can edit or delete them like any other. Kept in sync with
// the labels shown on the frontend.
const DEFAULT_PET_RULES: { trigger: PetTrigger; message: string; param: string | null }[] = [
  { trigger: "no_sms", message: "📵 {op}: трубка без СМС — отправьте клиенту, пока горячо!", param: null },
  { trigger: "big_dep", message: "💰 Крупный деп {dep} у {op} — проверьте код!", param: null },
];

// Advisory-lock namespace so concurrent first-time config loads don't seed the
// starter rules twice ("PET " as an int32).
const PET_SEED_LOCK = 0x50455420;

// Seeds the built-in rules once per branch. Fast path: a single indexed read
// that short-circuits on every call after the first. Slow path is serialized
// per branch via a transaction-scoped advisory lock.
async function ensureSeeded(branchId: number) {
  const pre = await prisma.petProfile.findUnique({ where: { branchId }, select: { seededDefaults: true } });
  if (pre?.seededDefaults) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PET_SEED_LOCK}::int, ${branchId}::int)`;
    const p = await tx.petProfile.findUnique({ where: { branchId }, select: { seededDefaults: true } });
    if (p?.seededDefaults) return; // another request won the race
    if (p) {
      await tx.petProfile.update({ where: { branchId }, data: { seededDefaults: true } });
    } else {
      await tx.petProfile.create({ data: { branchId, ...DEFAULT_PROFILE, seededDefaults: true } });
    }
    await tx.petRule.createMany({ data: DEFAULT_PET_RULES.map((r) => ({ branchId, ...r })) });
  });
}

export async function isPetEnabled(branchId: number): Promise<boolean> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { petEnabled: true } });
  return b?.petEnabled ?? false;
}

export async function getPetConfig(branchId: number) {
  // Only materialize starter rules where the module is actually on, so a plain
  // read doesn't create profiles for every branch.
  const enabledNow = await prisma.branch.findUnique({ where: { id: branchId }, select: { petEnabled: true } });
  if (enabledNow?.petEnabled) await ensureSeeded(branchId);

  const [branch, profile, rules] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, select: { petEnabled: true } }),
    prisma.petProfile.findUnique({
      where: { branchId },
      select: { name: true, skin: true, chattiness: true, aiEnabled: true, openRouterApiKey: true },
    }),
    prisma.petRule.findMany({
      where: { branchId },
      orderBy: { createdAt: "asc" },
      select: { id: true, trigger: true, param: true, message: true, enabled: true },
    }),
  ]);
  return {
    enabled: branch?.petEnabled ?? false,
    profile: profile
      ? {
          name: profile.name,
          skin: profile.skin,
          chattiness: profile.chattiness,
          aiEnabled: profile.aiEnabled,
          // Write-only secret: never send the key itself, only whether one is set.
          hasOpenRouterApiKey: !!profile.openRouterApiKey?.trim(),
        }
      : { ...DEFAULT_PROFILE, ...DEFAULT_AI_PROFILE_FIELDS },
    rules,
  };
}

// aiEnabled: boolean toggle. openRouterApiKey: undefined = leave unchanged,
// null = clear, string = set (write-only secret, never read back).
export async function updateProfile(
  branchId: number,
  patch: { name?: string; skin?: string; chattiness?: number; aiEnabled?: boolean; openRouterApiKey?: string | null }
) {
  const { openRouterApiKey, ...rest } = patch;
  const data: Record<string, unknown> = { ...rest };
  if (openRouterApiKey !== undefined) data.openRouterApiKey = openRouterApiKey;
  const profile = await prisma.petProfile.upsert({
    where: { branchId },
    create: { branchId, ...DEFAULT_PROFILE, ...data },
    update: data,
    select: { name: true, skin: true, chattiness: true, aiEnabled: true, openRouterApiKey: true },
  });
  return {
    name: profile.name,
    skin: profile.skin,
    chattiness: profile.chattiness,
    aiEnabled: profile.aiEnabled,
    hasOpenRouterApiKey: !!profile.openRouterApiKey?.trim(),
  };
}

export function addRule(branchId: number, trigger: PetTrigger, message: string, param: string | null) {
  return prisma.petRule.create({
    data: { branchId, trigger, message, param: PARAM_TRIGGERS.includes(trigger) ? param : null },
    select: { id: true, trigger: true, param: true, message: true, enabled: true },
  });
}

export async function updateRule(
  branchId: number,
  id: number,
  patch: { trigger?: PetTrigger; param?: string | null; message?: string; enabled?: boolean }
) {
  const result = await prisma.petRule.updateMany({ where: { id, branchId }, data: patch });
  if (result.count === 0) return null;
  return prisma.petRule.findUnique({
    where: { id },
    select: { id: true, trigger: true, param: true, message: true, enabled: true },
  });
}

export async function deleteRule(branchId: number, id: number) {
  const result = await prisma.petRule.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}

// --- Stage 5: AI layer (OpenRouter) ---
//
// The pet can ask an LLM for a couple of fresh, situational lines instead of
// only the fixed rule set. What leaves this server is a handful of counters
// for TODAY on this branch — no phone numbers, no client data, no operator
// names. Aggregates only, by design (see the "Питомец" project memory / the
// Stage 5 plan discussed with the admin).

// Free-tier OpenRouter models to try, in order — the free catalog churns
// (models get pulled with no notice, shared pools get saturated under load),
// so we fall back rather than pin one id. Deliberately non-reasoning instruct
// models only: a "thinking" model (e.g. the Nemotron nano *-reasoning
// variants) burns the token budget on chain-of-thought and never reaches the
// actual answer, which looks like a parse failure rather than what it is.
// 404 (model pulled) or 429 (that model's upstream pool saturated) advances
// to the next entry; anything else (bad key, timeout, garbled reply) stops —
// switching models wouldn't fix those.
const OPENROUTER_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "liquid/lfm-2.5-2.6b:free",
];
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 12000;

// Cached per branch for a few minutes — keeps us well under the free-tier
// rate limit and means the pet isn't re-querying an LLM every autopilot tick.
const AI_TIPS_TTL_MS = 6 * 60 * 1000;
const aiTipsCache = new Map<number, { tips: string[]; expiresAt: number }>();

function dayStartUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function depToNumber(dep: string | null): number {
  if (!dep) return 0;
  const n = Number(dep.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function collectShiftAggregates(branchId: number) {
  const from = dayStartUtc();
  const rows = await prisma.appeal.findMany({
    where: { branchId, date: { gte: from }, deletedAt: null },
    select: { dep: true, status: true, smsSentById: true },
  });
  const total = rows.length;
  const noSms = rows.filter((r) => !r.smsSentById).length;
  const bigDeps = rows.filter((r) => depToNumber(r.dep) >= 1_000_000).length;
  const nedozhal = rows.filter((r) => /недож/i.test(r.status)).length;
  return { total, noSms, bigDeps, nedozhal };
}

async function getOpenRouterKey(branchId: number): Promise<string | null> {
  const p = await prisma.petProfile.findUnique({
    where: { branchId },
    select: { aiEnabled: true, openRouterApiKey: true },
  });
  if (!p?.aiEnabled) return null;
  return p.openRouterApiKey?.trim() || null;
}

// Returns 1–2 short, situational lines the pet can say, or [] if the AI
// layer is off, unconfigured, or the request fails — the rule engine always
// covers the gap, so a failure here is never user-visible as an error.
export async function getAiTips(branchId: number): Promise<string[]> {
  const cached = aiTipsCache.get(branchId);
  if (cached && cached.expiresAt > Date.now()) return cached.tips;

  const apiKey = await getOpenRouterKey(branchId);
  if (!apiKey) return [];

  const agg = await collectShiftAggregates(branchId);
  if (agg.total === 0) return [];

  const requestBody = (model: string) =>
    JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "Ты — дружелюбный питомец-талисман в CRM колл-центра. По сводке смены дай 1-2 очень короткие " +
            "живые реплики (до 100 символов каждая) — подсказку или похвалу оператору. Пиши по-русски, " +
            "разговорно, можно с эмодзи в начале строки. Никаких персональных данных ты не знаешь и не " +
            "выдумывай их. Не рассуждай вслух, не показывай ход мыслей, никаких <think> и пояснений — " +
            "сразу и только JSON-массив строк, ничего больше, например: " +
            '["🔥 текст первой реплики", "📉 текст второй реплики"]',
        },
        {
          role: "user",
          content: JSON.stringify({
            период: "сегодня",
            трубок_всего: agg.total,
            без_смс: agg.noSms,
            крупных_депов: agg.bigDeps,
            недожал: agg.nedozhal,
          }),
        },
      ],
    });

  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Required by OpenRouter for free-tier attribution — harmless placeholders.
          "HTTP-Referer": "https://anticrm.local",
          "X-Title": "CRM Pet Assistant",
        },
        body: requestBody(model),
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Never user-visible (the pet just skips the AI beat), but the admin
        // who configured the key can't otherwise tell "wrong key" from "no
        // quota" from "nothing happened" — log it so `docker compose logs`
        // shows why. 404 = the free catalog dropped this model; 429 on a
        // free-tier model is usually the shared upstream provider pool being
        // saturated (not our key's own limit — each candidate is a different
        // provider with its own pool). Both are worth trying the next model
        // for instead of giving up; anything else (401 bad key, etc.) won't
        // be fixed by switching models.
        const body = await res.text().catch(() => "");
        console.error(`[pet] OpenRouter ${res.status} (${model}) for branch ${branchId}: ${body.slice(0, 500)}`);
        if (res.status === 404 || res.status === 429) continue;
        return [];
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        console.error(`[pet] OpenRouter empty content (${model}) for branch ${branchId}: ${JSON.stringify(data).slice(0, 500)}`);
        continue; // try the next model rather than give up on one bad reply
      }

      // Models sometimes wrap the array in a ```json fence, or (reasoning
      // models especially) burn the token budget on chain-of-thought and
      // never reach an array at all — either way, move on to the next model.
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error(`[pet] OpenRouter reply not a JSON array (${model}) for branch ${branchId}: ${text.slice(0, 300)}`);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.error(`[pet] OpenRouter reply had unparsable JSON (${model}) for branch ${branchId}: ${jsonMatch[0].slice(0, 300)}`);
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      const tips = parsed.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 2);
      if (tips.length === 0) continue;

      aiTipsCache.set(branchId, { tips, expiresAt: Date.now() + AI_TIPS_TTL_MS });
      return tips;
    } catch (err) {
      // network error or timeout on this model — try the next one
      console.error(`[pet] OpenRouter request failed (${model}) for branch ${branchId}:`, err instanceof Error ? err.message : err);
    }
  }
  return []; // every candidate model failed one way or another
}
