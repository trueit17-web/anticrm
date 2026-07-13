import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError, getActiveBranchId } from "../api/client";
import { Appeal, Branch, ROLE_LABELS, SelectOption } from "../types";
import { AppealsTable, NewAppealValues } from "../components/AppealsTable";
import { AppealFormModal, AppealFormValues } from "../components/AppealFormModal";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconAdmin, IconLogout, IconStats, IconTorii, IconUsers } from "../components/icons";
import { Link } from "react-router-dom";

type TagField = "gov" | "cb" | "fsb" | "closer";

function optionValues(options: SelectOption[], field: SelectOption["field"]): string[] {
  return options.filter((o) => o.field === field).map((o) => o.value);
}

function statusColorMap(options: SelectOption[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const o of options) {
    if (o.field === "STATUS" && o.color) map[o.value] = o.color;
  }
  return map;
}

export function AppealsPage() {
  const { user, logout } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appeal | null>(null);
  const [creating, setCreating] = useState(false);
  const [branchName, setBranchName] = useState<string | null>(user?.branchName ?? null);

  // `silent` is used for the background poll below: it refreshes the data
  // without flashing the loading state or an error banner over the table
  // the operator is currently looking at / working in.
  async function loadAppeals(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.get<{ appeals: Appeal[] }>("/appeals");
      setAppeals(res.appeals);
    } catch (err) {
      if (!opts?.silent) {
        setError(err instanceof ApiError ? err.message : "Не удалось загрузить трубки");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadAppeals();
    api
      .get<{ options: SelectOption[] }>("/select-options")
      .then((res) => setOptions(res.options))
      .catch(() => {});
    // Refines the header title for SUPERADMIN/multi-branch accounts, whose
    // active branch (picked via the switcher) can differ from their home one.
    api
      .get<{ branches: Branch[] }>("/branches/mine")
      .then((res) => {
        const activeId = getActiveBranchId();
        const active = activeId ? res.branches.find((b) => b.id === activeId) : null;
        if (active) setBranchName(active.name);
        else if (res.branches.length === 1) setBranchName(res.branches[0].name);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Keeps everyone's table in sync with what other operators are doing —
    // paused while the tab isn't visible so it doesn't poll in the background.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAppeals({ silent: true });
      }
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const branchRequired = user.role === "SUPERADMIN" && getActiveBranchId() === null;

  async function handleSubmitCreate(values: NewAppealValues) {
    await api.post("/appeals", values);
    setCreating(false);
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
          <h1>{branchName ?? "Трубки"}</h1>
          <p className="muted">
            {user.fullName} · {ROLE_LABELS[user.role]} · за сегодня
          </p>
        </div>
        <div className="header-actions">
          <BranchSwitcher />
          {user.role === "SUPERADMIN" && (
            <Link to="/branches" className="icon-link" title="Филиалы" aria-label="Филиалы">
              <IconTorii />
            </Link>
          )}
          <Link to="/stats" className="icon-link" title="Статистика" aria-label="Статистика">
            <IconStats />
          </Link>
          {(user.role === "ADMIN" || user.role === "SUPERADMIN") && (
            <Link to="/admin" className="icon-link" title="Админка" aria-label="Админка">
              <IconAdmin />
            </Link>
          )}
          {(user.role === "ADMIN" || user.role === "SUPERADMIN") && (
            <Link to="/users" className="icon-link" title="Пользователи" aria-label="Пользователи">
              <IconUsers />
            </Link>
          )}
          <button className="icon-link" title="Выйти" aria-label="Выйти" onClick={logout}>
            <IconLogout />
          </button>
        </div>
      </header>

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {branchRequired && (
        <p className="muted">Выберите филиал переключателем сверху, чтобы увидеть трубки.</p>
      )}

      {!loading && !error && !branchRequired && (
        <div className="table-with-fab">
          <button className="fab" title="Новая трубка" onClick={() => setCreating(true)}>
            +
          </button>
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
            statusColors={statusColorMap(options)}
            creating={creating}
            onCancelCreate={() => setCreating(false)}
            onSubmitCreate={handleSubmitCreate}
          />
        </div>
      )}

      {editing && (
        <AppealFormModal
          appeal={editing}
          onClose={() => setEditing(null)}
          onSubmit={(values) => handleUpdate(editing.id, values)}
        />
      )}
    </div>
  );
}
