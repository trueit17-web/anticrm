import { OperatorStat, PetConfig } from "../../types";
import { PetOverlay, PetReaction } from "./petShared";

// Corner-mode assistant for the Статистика page: praises the week's leader,
// nudges about operators sitting at zero, and calls out the team total.
export function PetStatsAssistant({ byOperator, config }: { byOperator: OperatorStat[]; config: PetConfig }) {
  function collect(): PetReaction[] {
    const candidates: PetReaction[] = [];

    const ranked = [...byOperator].sort((a, b) => b.count - a.count);
    const top = ranked[0];
    if (top && top.count > 0) {
      candidates.push({ mood: "cheer", text: `🏆 ${top.fullName} — лидер: ${top.count} трубок! Так держать! 🎉` });
    }

    const zero = byOperator.find((o) => o.count === 0);
    if (zero) {
      candidates.push({ mood: "happy", text: `У ${zero.fullName} пока 0 трубок — подбодрите коллегу! 💪` });
    }

    const total = byOperator.reduce((s, o) => s + o.count, 0);
    if (total > 0) {
      candidates.push({ mood: "happy", text: `📊 Всего за период ${total} трубок. Отличная работа команды!` });
    }

    return candidates;
  }

  return (
    <PetOverlay
      corner
      profile={config.profile}
      greeting={`Привет! Я ${config.profile.name} 🐾 Слежу за статистикой.`}
      collect={collect}
    />
  );
}
