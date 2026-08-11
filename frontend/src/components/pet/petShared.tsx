import { PetSkin, PetTrigger } from "../../types";

export type PetEmotion = "happy" | "alert" | "cheer" | "sleep";

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
  custom: "Своё (любая строка)",
};

// Built-in rules the pet always knows, so it's useful the moment the module
// is switched on — admins add more via PetRule. Messages accept {op}, {dep},
// {phone} placeholders.
export const DEFAULT_RULES: { trigger: PetTrigger; message: string; mood: PetEmotion }[] = [
  { trigger: "no_sms", message: "📵 {op}: трубка без СМС — отправьте клиенту, пока горячо!", mood: "alert" },
  { trigger: "big_dep", message: "💰 Крупный деп {dep} у {op} — проверьте код!", mood: "alert" },
];

export const CHATTINESS_LABELS = ["Тихий", "Обычный", "Болтливый"];

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
