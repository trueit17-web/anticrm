import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { InnCheckResult, InnEntry } from "../../types";
import { IconNotepadPencil } from "../icons";
import { InnEntriesTable } from "./InnEntriesTable";

function todayInputValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDate(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Dock icon fixed at the left edge + a left-side drawer with the operator's
// personal "ИНН" log for the picked day. Open/close mirrors
// EmployeeCardPopover's pattern (EmployeeCard.tsx): click-outside, Escape,
// and — per this module's own spec — a repeat Enter press while focus isn't
// inside a text field. Records may be created/edited/deleted for any day,
// not just today — the ‹ › arrows just move which day's log is in view.
export function InnModule() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayInputValue());
  const [entries, setEntries] = useState<InnEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [searchInn, setSearchInn] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<{ entries: InnEntry[] }>(`/inn/mine?date=${date}`)
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Enter") {
        const active = document.activeElement;
        const inField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!inField) setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Scrolls to + temporarily highlights the row a search just landed on,
  // once it's actually present in the (possibly just-reloaded) entries list.
  useEffect(() => {
    if (highlightId === null) return;
    const el = document.querySelector(`[data-inn-entry-id="${highlightId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightId, entries]);

  // Pre-save check for the create/update forms: does this ИНН already show
  // up recently for the branch? Used to confirm with the operator before
  // actually writing anything.
  function checkWarning(inn: string): Promise<InnCheckResult> {
    return api.get<InnCheckResult>(`/inn/check?inn=${encodeURIComponent(inn)}&date=${date}`);
  }

  // Finds the operator's own most recent entry for this ИНН across any
  // date, jumps the date picker there, and highlights the matched row.
  function handleSearch() {
    const query = searchInn.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError(null);
    api
      .get<{ entry: InnEntry | null }>(`/inn/search?inn=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.entry) {
          setSearchError("Не найдено");
          return;
        }
        const entryDate = res.entry.date.slice(0, 10);
        setHighlightId(res.entry.id);
        if (entryDate === date) load();
        else setDate(entryDate);
      })
      .catch((err) => setSearchError(err instanceof ApiError ? err.message : "Не удалось найти"))
      .finally(() => setSearching(false));
  }

  function handleCreate(data: { inn: string; contactsCount: number; transferredCount: number; called: boolean }) {
    api
      .post<{ entry: InnEntry }>("/inn", { ...data, date })
      .then((res) => setEntries((prev) => [...prev, res.entry]))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось сохранить"));
  }

  function handleUpdate(
    id: number,
    data: { inn?: string; contactsCount?: number; transferredCount?: number; called?: boolean }
  ) {
    api
      .patch<{ entry: InnEntry }>(`/inn/${id}`, data)
      .then((res) => setEntries((prev) => prev.map((e) => (e.id === id ? res.entry : e))))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось сохранить"));
  }

  function handleDelete(id: number) {
    api
      .delete(`/inn/${id}`)
      .then(() => setEntries((prev) => prev.filter((e) => e.id !== id)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось удалить"));
  }

  return (
    <>
      <button
        className="inn-dock-icon"
        onClick={() => setOpen((o) => !o)}
        title="ИНН"
        aria-label="ИНН"
      >
        <IconNotepadPencil width={30} height={30} />
      </button>
      {open && (
        <div className="inn-drawer-overlay">
          <div className="inn-drawer" ref={drawerRef}>
            <header className="inn-drawer-header">
              <h2>ИНН</h2>
              <div className="inn-date-nav">
                <button
                  type="button"
                  onClick={() => setDate((d) => shiftDate(d, -1))}
                  title="Предыдущий день"
                  aria-label="Предыдущий день"
                >
                  ‹
                </button>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <button
                  type="button"
                  onClick={() => setDate((d) => shiftDate(d, 1))}
                  title="Следующий день"
                  aria-label="Следующий день"
                >
                  ›
                </button>
              </div>
              <div className="inn-search">
                <input
                  value={searchInn}
                  onChange={(e) => setSearchInn(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  placeholder="Поиск по ИНН"
                />
                <button type="button" onClick={handleSearch} disabled={!searchInn.trim() || searching}>
                  Найти
                </button>
              </div>
            </header>
            {searchError && <p className="error-text">{searchError}</p>}
            {error && <p className="error-text">{error}</p>}
            {loading ? <p className="muted">Загрузка...</p> : (
              <InnEntriesTable
                entries={entries}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                checkWarning={checkWarning}
                highlightId={highlightId}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
