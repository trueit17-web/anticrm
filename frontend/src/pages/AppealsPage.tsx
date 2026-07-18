import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError, getActiveBranchId } from "../api/client";
import { Appeal, Branch, OperatorStat, ROLE_LABELS, SelectOption } from "../types";
import { AppealsTable, NewAppealValues } from "../components/AppealsTable";
import { AppealFormModal, AppealFormValues } from "../components/AppealFormModal";
import { BranchSwitcher } from "../components/BranchSwitcher";
import {
  IconAdmin,
  IconBack,
  IconLogout,
  IconPhone,
  IconRestore,
  IconStats,
  IconTorii,
  IconTrash,
  IconUsers,
} from "../components/icons";
import { canDeleteAppeal } from "../lib/permissions";
import { EmployeeAvatarButton } from "../components/EmployeeCard";
import { Link } from "react-router-dom";

type TagField = "gov" | "cb" | "fsb" | "closer" | "tf";

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

function defaultStatusValue(options: SelectOption[]): string {
  const statuses = options.filter((o) => o.field === "STATUS");
  return statuses.find((o) => o.isDefault)?.value ?? statuses[0]?.value ?? "Новое";
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatRuDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Monday of the week containing isoDate — weeks here always run Пн–Сб.
function mondayOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

// Top 3 by trubki count for the current week (Пн–Сб) — shown centered in the
// header as an avatar with a rank ring (gold/silver/plain).
function WeekLeaders() {
  const [leaders, setLeaders] = useState<OperatorStat[]>([]);

  useEffect(() => {
    const monday = mondayOfWeek(todayInputValue());
    const to = new Date(`${monday}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 6);
    api
      .get<{ byOperator: OperatorStat[] }>(`/appeals/stats?from=${monday}&to=${to.toISOString().slice(0, 10)}`)
      .then((res) => setLeaders(res.byOperator.slice(0, 3)))
      .catch(() => {});
  }, []);

  if (leaders.length === 0) return null;

  // Displayed 2nd–1st–3rd (podium order) rather than the ranking order —
  // 1st stays centered as the visual focal point.
  const ranked = leaders.map((l, i) => ({ ...l, rank: (i + 1) as 1 | 2 | 3 }));
  const podiumOrder = [ranked[1], ranked[0], ranked[2]].filter(
    (l): l is (typeof ranked)[number] => l !== undefined
  );

  return (
    <div className="week-leaders" title="Лучшие по числу трубок за текущую неделю (Пн–Сб)">
      {podiumOrder.map((l) => (
        <EmployeeAvatarButton
          key={l.operatorId}
          id={l.operatorId}
          fullName={l.fullName}
          avatarUrl={l.avatarUrl}
          count={l.count}
          rank={l.rank}
        />
      ))}
    </div>
  );
}

function DeletedAppealsPanel({ date }: { date: string }) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<{ appeals: Appeal[] }>(`/appeals/deleted?date=${date}`)
      .then((res) => setAppeals(res.appeals))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [date]);

  async function handleRestore(id: number) {
    setAppeals((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.post(`/appeals/${id}/restore`);
    } finally {
      load();
    }
  }

  return (
    <section>
      <h2>Удалённые трубки за {date === todayInputValue() ? "сегодня" : formatRuDate(date)}</h2>
      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && appeals.length === 0 && (
        <p className="empty-state">Удалённых трубок нет.</p>
      )}
      {!loading && !error && appeals.length > 0 && (
        <div className="table-scroll">
          <table className="appeals-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Телефон</th>
                <th>Данные клиента</th>
                <th>Статус</th>
                <th>Удалено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {appeals.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.operator.fullName}, {formatTime(a.createdAt)}
                  </td>
                  <td>{a.phone}</td>
                  <td className="wrap-cell" title={a.clientData ?? undefined}>
                    {a.clientData || "—"}
                  </td>
                  <td>
                    <span className="status-pill">{a.status}</span>
                  </td>
                  <td className="muted">{a.deletedAt ? formatTime(a.deletedAt) : "—"}</td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Восстановить"
                      aria-label="Восстановить"
                      onClick={() => handleRestore(a.id)}
                    >
                      <IconRestore width={16} height={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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
  // Only SUPERADMIN gets to pick a date other than today (see the date input
  // in the header) — everyone else always works off today's trubki.
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [showTrash, setShowTrash] = useState(false);

  // `silent` is used for the background poll below: it refreshes the data
  // without flashing the loading state or an error banner over the table
  // the operator is currently looking at / working in.
  async function loadAppeals(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.get<{ appeals: Appeal[] }>(`/appeals?date=${selectedDate}`);
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
    // Re-runs on mount and whenever the SUPERADMIN date picker changes.
    loadAppeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    // Keeps everyone's table in sync with what other operators are doing —
    // paused while the tab isn't visible so it doesn't poll in the background.
    // Depends on selectedDate so it keeps polling whichever date is open.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAppeals({ silent: true });
      }
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

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

  async function handleDeleteAppeal(appeal: Appeal) {
    setAppeals((prev) => prev.filter((a) => a.id !== appeal.id));
    try {
      await api.delete(`/appeals/${appeal.id}`);
    } finally {
      await loadAppeals();
    }
  }

  return (
    <div className="page">
      <header className="page-header page-header-center">
        <div>
          <h1>{branchName ?? "Трубки"}</h1>
          <p className="muted">
            {user.fullName} · {ROLE_LABELS[user.role]} ·{" "}
            {selectedDate === todayInputValue() ? "за сегодня" : `за ${formatRuDate(selectedDate)}`}
          </p>
        </div>
        <WeekLeaders />
        <div className="header-actions">
          {user.role === "SUPERADMIN" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              title="Показать трубки за дату"
            />
          )}
          <BranchSwitcher />
          {user.role === "SUPERADMIN" && (
            <Link to="/branches" className="icon-link" title="Филиалы" aria-label="Филиалы">
              <IconTorii />
            </Link>
          )}
          <Link to="/stats" className="icon-link" title="Статистика" aria-label="Статистика">
            <IconStats />
          </Link>
          {(user.role === "MANAGER" || user.role === "ADMIN" || user.role === "SUPERADMIN") && (
            <Link to="/contacts" className="icon-link" title="Прозвон" aria-label="Прозвон">
              <IconPhone />
            </Link>
          )}
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
          {canDeleteAppeal(user) && (
            <button
              className="icon-link"
              title={showTrash ? "К трубкам" : "Корзина"}
              aria-label={showTrash ? "К трубкам" : "Корзина"}
              onClick={() => setShowTrash((v) => !v)}
            >
              {showTrash ? <IconBack /> : <IconTrash />}
            </button>
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

      {!loading && !error && !branchRequired && showTrash && <DeletedAppealsPanel date={selectedDate} />}

      {!loading && !error && !branchRequired && !showTrash && (
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
            onDelete={user.role === "SUPERADMIN" ? handleDeleteAppeal : undefined}
            govOptions={optionValues(options, "GOV")}
            cbOptions={optionValues(options, "CB")}
            fsbOptions={optionValues(options, "FSB")}
            closerOptions={optionValues(options, "CLOSER")}
            tfOptions={optionValues(options, "TF")}
            statusOptions={optionValues(options, "STATUS")}
            statusColors={statusColorMap(options)}
            defaultStatus={defaultStatusValue(options)}
            listDate={selectedDate}
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
