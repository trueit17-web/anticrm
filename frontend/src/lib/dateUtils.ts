export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatRuDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
