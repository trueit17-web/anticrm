import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { AdminChangeLogEntry } from "../types";

function formatChangedAt(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ENTITY_LABELS: Record<AdminChangeLogEntry["entityType"], string> = {
  user: "Пользователь",
  branch: "Филиал",
};

type EntityFilter = "all" | "user" | "branch";

// Flat, read-only audit trail for admin-panel actions on Пользователи and
// Филиалы — трубки and ИНН already have their own per-record "История
// изменений", so this journal deliberately doesn't duplicate those.
export function AdminChangeLogManager() {
  const [filter, setFilter] = useState<EntityFilter>("all");
  const [entries, setEntries] = useState<AdminChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const query = filter === "all" ? "" : `?entityType=${filter}`;
    api
      .get<{ entries: AdminChangeLogEntry[] }>(`/admin-log${query}`)
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить журнал"))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div>
      <p className="muted">
        Кто и что менял в разделах «Пользователи» и «Филиалы» — создание, редактирование, перенос
        между филиалами. У трубок и ИНН своя история изменений, здесь не дублируется.
      </p>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab${filter === "all" ? " admin-tab-active" : ""}`}
          onClick={() => setFilter("all")}
        >
          Всё
        </button>
        <button
          type="button"
          className={`admin-tab${filter === "user" ? " admin-tab-active" : ""}`}
          onClick={() => setFilter("user")}
        >
          Пользователи
        </button>
        <button
          type="button"
          className={`admin-tab${filter === "branch" ? " admin-tab-active" : ""}`}
          onClick={() => setFilter("branch")}
        >
          Филиалы
        </button>
      </div>

      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && entries.length === 0 && <p className="muted">Записей пока нет.</p>}
      {!loading && !error && entries.length > 0 && (
        <ul className="history-list">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="muted">{formatChangedAt(e.changedAt)}</span> — <b>{e.changedBy.fullName}</b>
              {": "}
              [{ENTITY_LABELS[e.entityType]} «{e.entityLabel}»] {e.fieldLabel}: «{e.oldValue ?? "—"}» → «
              {e.newValue ?? "—"}»
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
