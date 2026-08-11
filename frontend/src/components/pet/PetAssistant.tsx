import { RefObject } from "react";
import { Appeal, PetConfig, PetTrigger } from "../../types";
import { formatMoney } from "../../lib/money";
import { detectMobileOperator } from "../../lib/mobileOperator";
import { PetEmotion, PetOverlay, PetReaction, DEFAULT_RULES } from "./petShared";

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

// Returns the index of the first appeal matching a trigger, or -1.
function matchIndex(trigger: PetTrigger, appeals: Appeal[], param: string | null): number {
  switch (trigger) {
    case "no_sms":
      return appeals.findIndex((a) => !a.smsSentBy);
    case "big_dep":
      return appeals.findIndex((a) => depNumber(a.dep) >= 1_000_000);
    case "nedozhal":
      return appeals.findIndex((a) => /недож/i.test(a.status));
    case "stalled":
      return appeals.findIndex((a) => !a.smsSentBy && Date.now() - new Date(a.createdAt).getTime() > 2 * 3600_000);
    case "status":
      return param ? appeals.findIndex((a) => a.status === param) : -1;
    case "phone_operator":
      return param ? appeals.findIndex((a) => detectMobileOperator(a.phone) === param) : -1;
    case "daily_count": {
      // Total trubki for the day reaching the threshold — anchors to the last
      // row so the pet celebrates the running tally.
      const threshold = Number(param);
      return Number.isFinite(threshold) && appeals.length >= threshold ? appeals.length - 1 : -1;
    }
    case "custom":
      return appeals.length ? Math.floor(Math.random() * appeals.length) : -1;
    default:
      return -1;
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
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  appeals: Appeal[];
  config: PetConfig;
}) {
  // Built-in rules + admin-taught ones (enabled only).
  const rules = [
    ...DEFAULT_RULES.map((r) => ({ ...r, param: null as string | null })),
    ...config.rules
      .filter((r) => r.enabled)
      .map((r) => ({ trigger: r.trigger, param: r.param, message: r.message, mood: moodFor(r.trigger) })),
  ];

  function evaluate(): PetReaction | null {
    for (const rule of rules) {
      const i = matchIndex(rule.trigger, appeals, rule.param);
      if (i >= 0) return { rowIndex: i, mood: rule.mood, text: fill(rule.message, appeals[i], appeals.length) };
    }
    return null;
  }

  return (
    <PetOverlay
      containerRef={containerRef}
      profile={config.profile}
      greeting={`Привет! Я ${config.profile.name} 🐾 Присматриваю за трубками — подскажу, если что.`}
      evaluate={evaluate}
    />
  );
}
