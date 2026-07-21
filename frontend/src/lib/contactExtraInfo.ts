// Contact.extraInfo is a flattened "Label: value; Label: value" string (see
// backend/src/utils/parseContactsFile.ts). Pulls out the couple of labels
// the call card treats specially — birth date and any extra phone numbers —
// and leaves the rest as individual {label, value} fields, one per line,
// for the generic "Доп. инфа" display.
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
const INN_LABELS = ["инн юл", "инн (юл)", "инн юр.лица", "инн юридического лица", "инн организации"];
const ADDRESS_LABELS = ["адрес", "адрес клиента", "address"];

export interface ExtraInfoField {
  label: string | null;
  value: string;
}

export interface ParsedExtraInfo {
  birthDate: string | null;
  extraPhones: string[];
  inn: string | null;
  address: string | null;
  rest: ExtraInfoField[];
}

export function parseExtraInfo(extraInfo: string | null | undefined): ParsedExtraInfo {
  if (!extraInfo) return { birthDate: null, extraPhones: [], inn: null, address: null, rest: [] };

  let birthDate: string | null = null;
  let extraPhones: string[] = [];
  let inn: string | null = null;
  let address: string | null = null;
  const rest: ExtraInfoField[] = [];

  for (const part of extraInfo.split(";").map((p) => p.trim())) {
    if (!part) continue;
    const sep = part.indexOf(":");
    if (sep === -1) {
      rest.push({ label: null, value: part });
      continue;
    }
    const label = part.slice(0, sep).trim();
    const value = part.slice(sep + 1).trim();
    const labelLower = label.toLowerCase();
    if (BIRTH_DATE_LABELS.includes(labelLower)) {
      birthDate = value;
    } else if (EXTRA_PHONE_LABELS.includes(labelLower)) {
      extraPhones = value
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    } else if (INN_LABELS.includes(labelLower)) {
      inn = value;
    } else if (ADDRESS_LABELS.includes(labelLower)) {
      address = value;
    } else {
      rest.push({ label, value });
    }
  }

  return { birthDate, extraPhones, inn, address, rest };
}

// True if `fullName` already visibly contains the birth date (real-world
// uploads sometimes bake it into the name column itself) — used to avoid
// showing "ФИО ... 11.05.1965 — 11.05.1965" in the call card header.
export function fullNameIncludesBirthDate(fullName: string | null | undefined, birthDate: string | null): boolean {
  if (!fullName || !birthDate) return false;
  return fullName.includes(birthDate);
}
