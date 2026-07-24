// Best-effort "what time is it where the client lives" for the call card —
// maps a free-text Russian region name (from the uploaded "Регион" column) to
// its UTC offset, then formats the current local wall-clock time there. Russia
// spans UTC+2..+12; anything not matched falls back to Moscow time (UTC+3),
// which covers all of European Russia (incl. Татарстан, Башкирия is +5 below).
//
// Keyword substring match, so "Республика Татарстан", "татарстан",
// "Свердловская область" etc. all resolve. Order doesn't matter — offsets are
// disjoint by keyword.
const REGION_OFFSETS: { offset: number; keywords: string[] }[] = [
  { offset: 2, keywords: ["калининград"] },
  { offset: 4, keywords: ["самар", "саратов", "астрахан", "ульяновск", "удмурт", "ижевск"] },
  {
    offset: 5,
    keywords: [
      "свердлов",
      "екатеринбург",
      "челябинск",
      "тюмен",
      "курган",
      "оренбург",
      "перм",
      "башк",
      "уфа",
      "ханты",
      "хмао",
      "янао",
      "ямал",
    ],
  },
  { offset: 6, keywords: ["омск"] },
  {
    offset: 7,
    keywords: ["новосибир", "красноярск", "томск", "кемеров", "кузбасс", "алтай", "барнаул", "хакас", "тыва", "тува"],
  },
  { offset: 8, keywords: ["иркутск", "бурят", "улан-удэ"] },
  { offset: 9, keywords: ["якут", "саха", "амурск", "благовещенск", "чита", "забайкал"] },
  { offset: 10, keywords: ["владивосток", "приморск", "хабаровск", "еврейск", "биробиджан"] },
  { offset: 11, keywords: ["магадан", "сахалин"] },
  { offset: 12, keywords: ["камчат", "чукот", "анадырь", "петропавловск"] },
];

const MOSCOW_OFFSET = 3;

export function regionUtcOffset(region: string): number {
  const r = region.toLowerCase();
  for (const { offset, keywords } of REGION_OFFSETS) {
    if (keywords.some((k) => r.includes(k))) return offset;
  }
  return MOSCOW_OFFSET;
}

// Current local time in the region as "HH:MM", or null if no region given.
export function regionLocalTime(region: string | null | undefined): string | null {
  if (!region || !region.trim()) return null;
  const offset = regionUtcOffset(region);
  const now = new Date();
  const localMinutes = (((now.getUTCHours() * 60 + now.getUTCMinutes() + offset * 60) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(localMinutes / 60)).padStart(2, "0");
  const mm = String(localMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
