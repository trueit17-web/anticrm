import { RefObject, useEffect, useRef, useState } from "react";
import { PetProfile, PetSkin, PetTrigger } from "../../types";
import { MOBILE_OPERATORS } from "../../lib/mobileOperator";

export type PetEmotion = "happy" | "alert" | "cheer" | "sleep";

// One thing the pet can say/do: an emotion + message, optionally anchored to a
// table row (row-walking mode). Without rowIndex it just reacts in place.
export interface PetReaction {
  mood: PetEmotion;
  text: string;
  rowIndex?: number;
}

export const SKINS: { value: PetSkin; label: string; color: string; emoji: string }[] = [
  { value: "fox", label: "Лисёнок", color: "#cf9a44", emoji: "🦊" },
  { value: "robot", label: "Робот", color: "#7cc4ff", emoji: "🤖" },
  { value: "frog", label: "Жабка", color: "#9be27b", emoji: "🐸" },
  { value: "cat", label: "Котик", color: "#e79bd0", emoji: "🐱" },
];

export function skinColor(skin: PetSkin): string {
  return SKINS.find((s) => s.value === skin)?.color ?? "#cf9a44";
}

export const TRIGGER_LABELS: Record<PetTrigger, string> = {
  no_sms: "Нет СМС",
  big_dep: "Крупный деп",
  nedozhal: "Недожал",
  stalled: "Зависла трубка",
  status: "Статус",
  daily_count: "Трубок за день",
  phone_operator: "Оператор номера",
  custom: "Своё (любая строка)",
};

// Count thresholds offered for the "трубок за день" condition (matched as
// appeals.length >= threshold; 6 reads as "больше 5").
export const DAILY_COUNT_OPTIONS: { threshold: number; label: string }[] = [
  { threshold: 1, label: "Трубок за день ≥ 1" },
  { threshold: 3, label: "Трубок за день ≥ 3" },
  { threshold: 5, label: "Трубок за день ≥ 5" },
  { threshold: 6, label: "Трубок за день больше 5" },
];

// Built-in rules the pet always knows, so it's useful the moment the module
// is switched on — admins add more via PetRule. Messages accept {op}, {dep},
// {phone} placeholders.
export const DEFAULT_RULES: { trigger: PetTrigger; message: string; mood: PetEmotion }[] = [
  { trigger: "no_sms", message: "📵 {op}: трубка без СМС — отправьте клиенту, пока горячо!", mood: "alert" },
  { trigger: "big_dep", message: "💰 Крупный деп {dep} у {op} — проверьте код!", mood: "alert" },
];

export const CHATTINESS_LABELS = ["Тихий", "Обычный", "Болтливый"];

// Emotion a rule shows, derived from its trigger (mirrors PetAssistant).
export function moodForTrigger(trigger: PetTrigger): PetEmotion {
  if (trigger === "no_sms" || trigger === "big_dep") return "alert";
  if (trigger === "nedozhal" || trigger === "stalled" || trigger === "status" || trigger === "phone_operator")
    return "happy";
  return "cheer"; // daily_count / custom — celebratory
}

// A guessed condition: a base trigger, plus a status value when the text names
// one of the branch's real statuses.
export interface GuessedCond {
  trigger: PetTrigger;
  param: string | null;
}

// "Teach by plain text": guess which condition an admin means from the words in
// their tip, so they can just write the phrase and let the pet pick the rule.
// `statuses` are the branch's real (customizable) status values — if the text
// mentions one, we bind to that exact status. Always overridable in the UI.
export function guessTrigger(text: string, statuses: string[] = []): GuessedCond {
  const t = text.toLowerCase();
  // A real branch status named in the text wins — most specific.
  const named = statuses.find((s) => s.trim() && t.includes(s.toLowerCase()));
  if (named) return { trigger: "status", param: named };
  // A carrier named in the text (МТС / Билайн / …).
  const carrier = MOBILE_OPERATORS.find((c) => t.includes(c.toLowerCase()));
  if (carrier) return { trigger: "phone_operator", param: carrier };
  // "N трубок за день" / "за день … N".
  if (/за день|в день|дневн|план/.test(t)) {
    const m = t.match(/\d+/);
    if (m) return { trigger: "daily_count", param: m[0] };
  }
  // NB: no \b word boundaries — in JS regex \b is ASCII-only and never matches
  // around Cyrillic letters, so "смс" would slip through.
  if (/смс|sms/.test(t)) return { trigger: "no_sms", param: null };
  if (/недож/.test(t)) return { trigger: "nedozhal", param: null };
  if (/завис|давн|долго|не звон|молч/.test(t)) return { trigger: "stalled", param: null };
  if (/деп|млн|тыс|руб|₽|сумм|крупн/.test(t)) return { trigger: "big_dep", param: null };
  return { trigger: "custom", param: null };
}

// Fill placeholders with example values for the teaching preview.
export function fillExample(msg: string): string {
  return msg
    .replace(/\{op\}/g, "Иванов А.")
    .replace(/\{dep\}/g, "2 500 000 ₽")
    .replace(/\{phone\}/g, "+7 921 000-00-00");
}

// A themeable mascot: one body, per-skin ears + color, emotion-driven face.
export function PetSprite({
  skin,
  emo = "happy",
  size = 56,
}: {
  skin: PetSkin;
  emo?: PetEmotion;
  size?: number;
}) {
  const color = skinColor(skin);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: "visible", display: "block" }}>
      {/* ears / skin-specific top */}
      {skin === "robot" ? (
        <>
          <rect x="16" y="10" width="7" height="10" rx="2" fill={color} />
          <rect x="41" y="10" width="7" height="10" rx="2" fill={color} />
          <line x1="32" y1="9" x2="32" y2="2" stroke="#9aa" strokeWidth="1.5" />
          <circle cx="32" cy="1" r="3" fill="#ffd766" stroke="#b7891f" strokeWidth="1.2" />
        </>
      ) : skin === "frog" ? (
        <>
          <circle cx="22" cy="16" r="7" fill={color} />
          <circle cx="42" cy="16" r="7" fill={color} />
          <circle cx="22" cy="15" r="2.4" fill="#22201c" />
          <circle cx="42" cy="15" r="2.4" fill="#22201c" />
        </>
      ) : (
        <>
          <polygon points="15,20 21,5 31,18" fill={color} />
          <polygon points="49,20 43,5 33,18" fill={color} />
        </>
      )}

      <circle cx="32" cy="36" r="19" fill={color} />
      <ellipse cx="20" cy="40" rx="4" ry="2.6" fill="#e8756e" opacity="0.5" />
      <ellipse cx="44" cy="40" rx="4" ry="2.6" fill="#e8756e" opacity="0.5" />

      {/* eyes */}
      {emo === "sleep" ? (
        <>
          <path d="M21 33 q4 3 8 0" stroke="#22201c" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M35 33 q4 3 8 0" stroke="#22201c" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : emo === "cheer" ? (
        <>
          <path d="M22 34 L25 30 L28 34" stroke="#22201c" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M36 34 L39 30 L42 34" stroke="#22201c" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="25" cy="33" r="5" fill="#fff" />
          <circle cx="39" cy="33" r="5" fill="#fff" />
          <circle cx={emo === "alert" ? 25 : 26} cy={emo === "alert" ? 33 : 34} r={emo === "alert" ? 2.9 : 2.4} fill="#22201c" />
          <circle cx={emo === "alert" ? 39 : 40} cy={emo === "alert" ? 33 : 34} r={emo === "alert" ? 2.9 : 2.4} fill="#22201c" />
        </>
      )}

      {/* mouth */}
      {emo === "alert" ? (
        <ellipse cx="32" cy="44" rx="3" ry="4" fill="#22201c" />
      ) : emo === "sleep" ? (
        <path d="M29 44 h6" stroke="#22201c" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : emo === "cheer" ? (
        <path d="M25 42 q7 8 14 0" stroke="#22201c" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M27 43 q5 5 10 0" stroke="#22201c" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

// Shared pet engine used by every page's assistant. Two layouts:
//   • row-walking (corner=false): walks to a table row via rowSelector.
//   • corner (corner=true): floats fixed in the bottom-right, reacts in place —
//     used where the page has grouped/multiple tables (Прозвон, Статистика).
// Domain logic lives in `evaluate`, supplied by each page wrapper.
export function PetOverlay({
  containerRef,
  profile,
  greeting,
  evaluate,
  rowSelector = ".appeals-table tbody tr",
  corner = false,
}: {
  containerRef?: RefObject<HTMLDivElement | null>;
  profile: PetProfile;
  greeting: string;
  evaluate: () => PetReaction | null;
  rowSelector?: string;
  corner?: boolean;
}) {
  const [y, setY] = useState(8);
  const [emo, setEmo] = useState<PetEmotion>("happy");
  const [bubble, setBubble] = useState<{ text: string; show: boolean }>({ text: "", show: false });
  const [hop, setHop] = useState(false);

  const busyRef = useRef(false);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const evalRef = useRef(evaluate);
  evalRef.current = evaluate;

  function rowY(i: number): number | null {
    const c = containerRef?.current;
    if (!c) return null;
    const rows = c.querySelectorAll<HTMLTableRowElement>(rowSelector);
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

  function doReact(r: PetReaction) {
    busyRef.current = true;
    const finish = () => {
      setEmo(r.mood);
      setHop(false);
      requestAnimationFrame(() => setHop(true));
      speak(r.text);
      window.setTimeout(() => {
        busyRef.current = false;
      }, 700);
    };
    if (!corner && r.rowIndex !== undefined) {
      const ny = rowY(r.rowIndex);
      if (ny !== null) setY(ny);
      window.setTimeout(finish, 820);
    } else {
      finish();
    }
  }

  function checkOnce(): boolean {
    const r = evalRef.current();
    if (r) {
      doReact(r);
      return true;
    }
    return false;
  }

  // Greeting on mount.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setEmo("happy");
      if (!corner) setY(8);
      setHop(true);
      speak(greeting);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ambient autopilot; interval driven by chattiness (0 = off).
  useEffect(() => {
    const chat = profile.chattiness;
    if (chat <= 0) return;
    const period = chat >= 2 ? 7000 : 12000;
    const id = window.setInterval(() => {
      if (busyRef.current || document.visibilityState !== "visible") return;
      if (!checkOnce() && !corner) {
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
  }, [profile.chattiness]);

  return (
    <div className={`pet-layer${corner ? " pet-layer--corner" : ""}`} aria-hidden="true">
      <div
        className={`pet-sprite${hop ? " hop" : ""}`}
        style={corner ? undefined : { top: y }}
        onClick={() => {
          if (!busyRef.current && !checkOnce()) {
            setEmo("cheer");
            setHop(true);
            speak("Всё под контролем! 👍");
          }
        }}
        title={profile.name}
      >
        <PetSprite skin={profile.skin} emo={emo} />
      </div>
      <div className={`pet-bubble${bubble.show ? " show" : ""}`} style={corner ? undefined : { top: y + 2 }}>
        {bubble.text}
      </div>
    </div>
  );
}
