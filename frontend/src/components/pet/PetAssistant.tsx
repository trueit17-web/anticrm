import { RefObject } from "react";
import { Appeal, PetConfig, PetTrigger } from "../../types";
import { formatMoney } from "../../lib/money";
import { detectMobileOperator } from "../../lib/mobileOperator";
import { PetEmotion, PetOverlay, PetReaction } from "./petShared";

// Deposit string ("2 500 000", "2,5 млн"…) → number of rubles, best-effort.
function depNumber(dep: string | null): number {
  if (!dep) return 0;
  const n = Number(String(dep).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function moodFor(trigger: PetTrigger): PetEmotion {
  if (trigger === "no_sms" || trigger === "big_dep") return "alert";
  if (trigger === "nedozhal" || trigger === "stalled" || trigger === "status" || trigger === "phone_operator")
    return "happy";
  return "cheer"; // daily_count / custom
}

// Returns the indices of every appeal matching a trigger. Tips are personal:
// row-addressed triggers only match the current user's own trubki, so e.g. an
// "отправь СМС" nudge is seen only by the operator whose trubka it is — not by
// everyone looking at the same table.
function matchIndices(trigger: PetTrigger, appeals: Appeal[], param: string | null, userId: number): number[] {
  const mine = (a: Appeal) => a.operator.id === userId;
  const collect = (pred: (a: Appeal) => boolean) =>
    appeals.reduce<number[]>((acc, a, i) => (mine(a) && pred(a) ? (acc.push(i), acc) : acc), []);
  switch (trigger) {
    case "no_sms":
      return collect((a) => !a.smsSentBy);
    case "big_dep":
      return collect((a) => depNumber(a.dep) >= 1_000_000);
    case "nedozhal":
      return collect((a) => /недож/i.test(a.status));
    case "stalled":
      return collect((a) => !a.smsSentBy && Date.now() - new Date(a.createdAt).getTime() > 2 * 3600_000);
    case "status":
      return param ? collect((a) => a.status === param) : [];
    case "phone_operator":
      return param ? collect((a) => detectMobileOperator(a.phone) === param) : [];
    // daily_count is handled separately in collect() below — it's scoped to
    // the operator's own count, not a single appeal row match.
    case "daily_count":
      return [];
    case "custom":
      return collect(() => true);
    default:
      return [];
  }
}

function fill(msg: string, a: Appeal, count: number): string {
  return msg
    .replace(/\{op\}/g, a.operator.fullName)
    .replace(/\{dep\}/g, formatMoney(a.dep))
    .replace(/\{phone\}/g, a.phone)
    .replace(/\{count\}/g, String(count));
}

export function PetAssistant({
  containerRef,
  appeals,
  config,
  currentUserId,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  appeals: Appeal[];
  config: PetConfig;
  currentUserId: number;
}) {
  // All enabled rules (the built-in starter rules now live in the DB too, so
  // they're just regular editable rows here).
  const rules = config.rules
    .filter((r) => r.enabled)
    .map((r) => ({ trigger: r.trigger, param: r.param, message: r.message, mood: moodFor(r.trigger) }));

  // Every applicable tip (deduped), for the engine to rotate through.
  function collect(): PetReaction[] {
    const out: PetReaction[] = [];
    const seen = new Set<string>();

    for (const rule of rules) {
      if (rule.trigger === "daily_count") {
        const threshold = Number(rule.param);
        if (!Number.isFinite(threshold)) continue;
        // Own trubki only — a personal milestone, not a team tally.
        let count = 0;
        let lastOwnIndex = -1;
        for (let i = 0; i < appeals.length; i++) {
          if (appeals[i].operator.id === currentUserId) {
            count++;
            lastOwnIndex = i;
          }
        }
        if (count < threshold || lastOwnIndex === -1) continue;
        const appeal = appeals[lastOwnIndex];
        const key = lastOwnIndex + "|" + rule.message;
        if (seen.has(key)) continue;
        seen.add(key);
        // Name always leads the line, regardless of whether the admin's
        // template happens to include {op} elsewhere.
        const text = `${appeal.operator.fullName}: ${fill(rule.message, appeal, count)}`;
        out.push({ rowIndex: lastOwnIndex, mood: rule.mood, text });
        continue;
      }
      for (const i of matchIndices(rule.trigger, appeals, rule.param, currentUserId)) {
        const key = i + "|" + rule.message;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ rowIndex: i, mood: rule.mood, text: fill(rule.message, appeals[i], appeals.length) });
      }
    }
    return out;
  }

  return (
    <PetOverlay
      containerRef={containerRef}
      profile={config.profile}
      greeting={`Привет! Я ${config.profile.name} 🐾 Присматриваю за твоими трубками — подскажу и подбодрю.`}
      collect={collect}
    />
  );
}
