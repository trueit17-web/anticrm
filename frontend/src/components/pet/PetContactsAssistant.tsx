import { Contact, PetConfig } from "../../types";
import { parseExtraInfo } from "../../lib/contactExtraInfo";
import { formatMoney } from "../../lib/money";
import { PetOverlay, PetReaction } from "./petShared";

function depNumber(raw: string | null): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Corner-mode assistant for the Прозвон page: nudges managers through the
// call queue (empty queue = praise, big deposit waiting = alert, otherwise a
// "keep going" cheer).
export function PetContactsAssistant({ queue, config }: { queue: Contact[]; config: PetConfig }) {
  function collect(): PetReaction[] {
    if (queue.length === 0) {
      return [{ mood: "cheer", text: "Очередь пуста — красавцы! 🎉 Разобрали всё." }];
    }
    const out: PetReaction[] = [];
    let bestDep = 0;
    for (const c of queue) {
      const d = depNumber(parseExtraInfo(c.extraInfo).depositTotal);
      if (d > bestDep) bestDep = d;
    }
    if (bestDep >= 1_000_000) {
      out.push({
        mood: "alert",
        text: `💰 В очереди крупный клиент — деп ${formatMoney(String(bestDep))}. Берите первым!`,
      });
    }
    out.push({ mood: "happy", text: `📞 В очереди ${queue.length} контактов — вперёд, разбираем! 💪` });
    return out;
  }

  return (
    <PetOverlay
      corner
      profile={config.profile}
      greeting={`Привет! Я ${config.profile.name} 🐾 Помогу с обзвоном.`}
      collect={collect}
    />
  );
}
