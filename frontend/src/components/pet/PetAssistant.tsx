import { RefObject, useEffect, useRef, useState } from "react";
import { Appeal, PetConfig, PetTrigger } from "../../types";
import { formatMoney } from "../../lib/money";
import { PetEmotion, PetSprite, DEFAULT_RULES } from "./petShared";

// Deposit string ("2 500 000", "2,5 млн"…) → number of rubles, best-effort.
function depNumber(dep: string | null): number {
  if (!dep) return 0;
  const n = Number(String(dep).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function moodFor(trigger: PetTrigger): PetEmotion {
  if (trigger === "no_sms" || trigger === "big_dep") return "alert";
  if (trigger === "nedozhal" || trigger === "stalled") return "happy";
  return "cheer";
}

// Returns the index of the first appeal matching a trigger, or -1.
function matchIndex(trigger: PetTrigger, appeals: Appeal[]): number {
  switch (trigger) {
    case "no_sms":
      return appeals.findIndex((a) => !a.smsSentBy);
    case "big_dep":
      return appeals.findIndex((a) => depNumber(a.dep) >= 1_000_000);
    case "nedozhal":
      return appeals.findIndex((a) => /недож/i.test(a.status));
    case "stalled":
      return appeals.findIndex((a) => !a.smsSentBy && Date.now() - new Date(a.createdAt).getTime() > 2 * 3600_000);
    case "custom":
      return appeals.length ? Math.floor(Math.random() * appeals.length) : -1;
    default:
      return -1;
  }
}

function fill(msg: string, a: Appeal): string {
  return msg
    .replace(/\{op\}/g, a.operator.fullName)
    .replace(/\{dep\}/g, formatMoney(a.dep))
    .replace(/\{phone\}/g, a.phone);
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
  const [y, setY] = useState(8);
  const [emo, setEmo] = useState<PetEmotion>("happy");
  const [bubble, setBubble] = useState<{ text: string; show: boolean }>({ text: "", show: false });
  const [hop, setHop] = useState(false);

  const appealsRef = useRef(appeals);
  appealsRef.current = appeals;
  const busyRef = useRef(false);
  const bubbleTimer = useRef<number | undefined>(undefined);

  // Built-in rules + admin-taught ones (enabled only).
  const rules = [
    ...DEFAULT_RULES,
    ...config.rules
      .filter((r) => r.enabled)
      .map((r) => ({ trigger: r.trigger, message: r.message, mood: moodFor(r.trigger) })),
  ];

  function rowY(i: number): number | null {
    const c = containerRef.current;
    if (!c) return null;
    const rows = c.querySelectorAll<HTMLTableRowElement>(".appeals-table tbody tr");
    const row = rows[i];
    if (!row) return null;
    const cRect = c.getBoundingClientRect();
    const rRect = row.getBoundingClientRect();
    return rRect.top - cRect.top + rRect.height / 2 - 28;
  }

  function speak(text: string) {
    setBubble({ text, show: true });
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble((b) => ({ ...b, show: false })), 4200);
  }

  function react(i: number, mood: PetEmotion, text: string) {
    const ny = rowY(i);
    if (ny === null) return;
    busyRef.current = true;
    setY(ny);
    window.setTimeout(() => {
      setEmo(mood);
      setHop(false);
      // restart hop animation
      requestAnimationFrame(() => setHop(true));
      speak(text);
      window.setTimeout(() => {
        busyRef.current = false;
      }, 700);
    }, 820);
  }

  // Evaluate rules against current rows; react to the first match.
  function checkOnce(): boolean {
    const list = appealsRef.current;
    for (const rule of rules) {
      const i = matchIndex(rule.trigger, list);
      if (i >= 0) {
        react(i, rule.mood, fill(rule.message, list[i]));
        return true;
      }
    }
    return false;
  }

  // Greeting on mount.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setEmo("happy");
      setY(8);
      setHop(true);
      speak(`Привет! Я ${config.profile.name} 🐾 Присматриваю за трубками — подскажу, если что.`);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ambient autopilot; interval driven by chattiness (0 = off).
  useEffect(() => {
    const chat = config.profile.chattiness;
    if (chat <= 0) return;
    const period = chat >= 2 ? 7000 : 12000;
    const id = window.setInterval(() => {
      if (busyRef.current || document.visibilityState !== "visible") return;
      if (!checkOnce()) {
        // Nothing to flag — nap by the first row.
        const ny = rowY(0);
        if (ny !== null) {
          setY(ny);
          setEmo("sleep");
          setBubble((b) => ({ ...b, show: false }));
        }
      }
    }, period);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.profile.chattiness, config.rules.length]);

  return (
    <div className="pet-layer" aria-hidden="true">
      <div
        className={`pet-sprite${hop ? " hop" : ""}`}
        style={{ top: y }}
        onClick={() => {
          if (!busyRef.current && !checkOnce()) {
            setEmo("cheer");
            setHop(true);
            speak("Всё под контролем! 👍");
          }
        }}
        title={config.profile.name}
      >
        <PetSprite skin={config.profile.skin} emo={emo} />
      </div>
      <div className={`pet-bubble${bubble.show ? " show" : ""}`} style={{ top: y + 2 }}>
        {bubble.text}
      </div>
    </div>
  );
}
