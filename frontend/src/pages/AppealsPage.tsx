import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import { Appeal, ROLE_LABELS, SelectOption } from "../types";
import { AppealsTable } from "../components/AppealsTable";
import { AppealFormModal, AppealFormValues } from "../components/AppealFormModal";
import { Link } from "react-router-dom";

type TagField = "gov" | "cb" | "fsb" | "closer";

function optionValues(options: SelectOption[], field: SelectOption["field"]): string[] {
  return options.filter((o) => o.field === field).map((o) => o.value);
}

export function AppealsPage() {
  const { user, logout } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appeal | null | "new">(null);

  async function loadAppeals() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ appeals: Appeal[] }>("/appeals");
      setAppeals(res.appeals);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить обращения");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAppeals();
    api
      .get<{ options: SelectOption[] }>("/select-options")
      .then((res) => setOptions(res.options))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  async function handleCreate(values: AppealFormValues) {
    await api.post("/appeals", values);
    await loadAppeals();
  }

  async function handleUpdate(id: number, values: AppealFormValues) {
    await api.patch(`/appeals/${id}`, values);
    await loadAppeals();
  }

  async function handleToggleSms(appeal: Appeal, sms: boolean) {
    // Optimistic update so the checkbox doesn't feel laggy; reconciled on reload.
    setAppeals((prev) =>
      prev.map((a) =>
        a.id === appeal.id
          ? {
              ...a,
              smsSentBy: sms ? { id: user!.id, fullName: user!.fullName } : null,
              smsSentAt: sms ? new Date().toISOString() : null,
            }
          : a
      )
    );
    try {
      await api.patch(`/appeals/${appeal.id}/sms`, { sms });
    } finally {
      await loadAppeals();
    }
  }

  async function handleToggleIntake(appeal: Appeal, intake: boolean) {
    setAppeals((prev) => prev.map((a) => (a.id === appeal.id ? { ...a, intake } : a)));
    try {
      await api.patch(`/appeals/${appeal.id}`, { intake });
    } finally {
      await loadAppeals();
    }
  }

  async function handleInlineTagChange(appeal: Appeal, field: TagField, value: string | null) {
    setAppeals((prev) => prev.map((a) => (a.id === appeal.id ? { ...a, [field]: value } : a)));
    try {
      await api.patch(`/appeals/${appeal.id}`, { [field]: value });
    } finally {
      await loadAppeals();
    }
  }

  async function handleInlineStatusChange(appeal: Appeal, status: string) {
    setAppeals((prev) => prev.map((a) => (a.id === appeal.id ? { ...a, status } : a)));
    try {
      await api.patch(`/appeals/${appeal.id}`, { status });
    } finally {
      await loadAppeals();
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Обращения</h1>
          <p className="muted">
            {user.fullName} · {ROLE_LABELS[user.role]} · за сегодня
          </p>
        </div>
        <div className="header-actions">
          <Link to="/stats">Статистика</Link>
          {user.role === "ADMIN" && <Link to="/admin">Админка</Link>}
          {user.role === "ADMIN" && <Link to="/users">Пользователи</Link>}
          <button onClick={() => setEditing("new")}>+ Новое обращение</button>
          <button className="secondary" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <AppealsTable
          appeals={appeals}
          currentUser={user}
          onEdit={setEditing}
          onToggleSms={handleToggleSms}
          onToggleIntake={handleToggleIntake}
          onInlineTagChange={handleInlineTagChange}
          onInlineStatusChange={handleInlineStatusChange}
          govOptions={optionValues(options, "GOV")}
          cbOptions={optionValues(options, "CB")}
          fsbOptions={optionValues(options, "FSB")}
          closerOptions={optionValues(options, "CLOSER")}
          statusOptions={optionValues(options, "STATUS")}
        />
      )}

      {editing && (
        <AppealFormModal
          appeal={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={(values) =>
            editing === "new" ? handleCreate(values) : handleUpdate(editing.id, values)
          }
        />
      )}
    </div>
  );
}
