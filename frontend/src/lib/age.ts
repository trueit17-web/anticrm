// "ФИО + ДР" cells hold free text with the birth date written after the
// full name (e.g. "Иванов Иван Иванович 15.03.1985") — pulls that date out
// and turns it into an age, so the table can show "(40 лет)" the same way
// the phone column shows the detected mobile operator underneath.
const DATE_PATTERN = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4}|\d{2})\b/;

export function extractAge(clientData: string | null | undefined): number | null {
  if (!clientData) return null;
  const match = clientData.match(DATE_PATTERN);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  if (match[3].length === 2) year += year < 30 ? 2000 : 1900;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const birth = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthdayThisYear) age--;

  // Guards against misfires (a phone-number-shaped substring, a typo'd
  // year, a future date) rather than showing a nonsensical age.
  if (age < 0 || age > 120) return null;
  return age;
}

// Correct Russian plural for "год/года/лет".
export function ruYears(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "год";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "года";
  return "лет";
}
