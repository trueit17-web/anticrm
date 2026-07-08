// Best-effort lookup of a Russian mobile carrier from a phone number's DEF-code
// (the 3 digits after +7/8). This is NOT authoritative: numbers get ported
// between operators (MNP), and this table only covers common ranges for the
// big four. Treat the result as a hint for statistics, not a verified fact —
// extend CODE_MAP below if you spot a wrong/missing code.
const CODE_MAP: Record<string, string> = {
  // МТС
  "910": "МТС", "911": "МТС", "912": "МТС", "913": "МТС", "914": "МТС",
  "915": "МТС", "916": "МТС", "917": "МТС", "918": "МТС", "919": "МТС",
  "980": "МТС", "981": "МТС", "982": "МТС", "983": "МТС", "984": "МТС",
  "985": "МТС", "986": "МТС", "987": "МТС", "988": "МТС", "989": "МТС",

  // Билайн
  "903": "Билайн", "905": "Билайн", "906": "Билайн", "909": "Билайн",
  "960": "Билайн", "961": "Билайн", "962": "Билайн", "963": "Билайн",
  "964": "Билайн", "965": "Билайн", "966": "Билайн", "967": "Билайн",
  "968": "Билайн", "969": "Билайн", "996": "Билайн", "999": "Билайн",

  // МегаФон
  "920": "МегаФон", "921": "МегаФон", "922": "МегаФон", "923": "МегаФон",
  "924": "МегаФон", "925": "МегаФон", "926": "МегаФон", "927": "МегаФон",
  "928": "МегаФон", "929": "МегаФон", "936": "МегаФон", "937": "МегаФон",
  "938": "МегаФон", "939": "МегаФон",

  // Tele2
  "900": "Tele2", "901": "Tele2", "902": "Tele2", "904": "Tele2",
  "908": "Tele2", "950": "Tele2", "951": "Tele2", "952": "Tele2",
  "953": "Tele2", "958": "Tele2", "977": "Tele2", "993": "Tele2",
  "995": "Tele2",
};

export function detectMobileOperator(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length < 10) return "—";
  const code = local.slice(0, 3);
  return CODE_MAP[code] ?? "Неизвестно";
}
