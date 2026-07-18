// Contact.extraInfo is a flattened "Label: value; Label: value" string (see
// backend/src/utils/parseContactsFile.ts). Pulls out the couple of labels
// the call card treats specially — birth date and any extra phone numbers —
// and leaves the rest as-is for the generic "Доп. инфа" display.
const BIRTH_DATE_LABELS = ["дата рождения", "день рождения", "др", "birth date", "birthday"];
const EXTRA_PHONE_LABELS = [
  "доп номера",
  "доп. номера",
  "дополнительные номера",
  "доп телефон",
  "доп. телефон",
  "другие номера",
  "additional phone",
  "additional phones",
];

export interface ParsedExtraInfo {
  birthDate: string | null;
  extraPhones: string[];
  rest: string;
}

export function parseExtraInfo(extraInfo: string | null | undefined): ParsedExtraInfo {
  if (!extraInfo) return { birthDate: null, extraPhones: [], rest: "" };

  let birthDate: string | null = null;
  let extraPhones: string[] = [];
  const rest: string[] = [];

  for (const part of extraInfo.split(";").map((p) => p.trim())) {
    if (!part) continue;
    const sep = part.indexOf(":");
    if (sep === -1) {
      rest.push(part);
      continue;
    }
    const label = part.slice(0, sep).trim().toLowerCase();
    const value = part.slice(sep + 1).trim();
    if (BIRTH_DATE_LABELS.includes(label)) {
      birthDate = value;
    } else if (EXTRA_PHONE_LABELS.includes(label)) {
      extraPhones = value
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    } else {
      rest.push(part);
    }
  }

  return { birthDate, extraPhones, rest: rest.join("; ") };
}
