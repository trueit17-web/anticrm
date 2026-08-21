import { ClipboardEvent, Fragment, useEffect, useState } from "react";
import { api } from "../../api/client";
import { InnEntry, InnEntryWithOperator, InnStatsMine, InnStatsSummary, SelectOption, UserSummary } from "../../types";
import { IconRestore, IconTrash } from "../icons";

export type InnPeriod = "date" | "week" | "month";

function todayInputValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function addDays(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

// `date` is only meaningful for period === "date" — the specific day picked
// next to the period selector. Week/month always anchor on today, same as
// before.
function periodRange(period: InnPeriod, date: string): { from: string; to: string } {
  if (period === "date") return { from: date, to: addDays(date, 1) };
  const today = todayInputValue();
  if (period === "week") {
    const monday = mondayOfWeek(today);
    return { from: monday, to: addDays(monday, 7) };
  }
  return { from: addDays(today, -29), to: addDays(today, 1) };
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function Kpi({ value, label }: { value: number; label: string }) {
  return (
    <div className="kpi kpi--gold">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

// Splits pasted text into a list of non-negative integers (one per line, or
// comma/space/semicolon-separated — the usual shape when copying a column
// out of a spreadsheet).
function extractNumberList(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => /^\d+$/.test(t))
    .map(Number);
}

function rowWarningClass(entry: InnEntry): string {
  const classes = [
    entry.warningLevel === "red" ? "inn-row-warn-red" : entry.warningLevel === "yellow" ? "inn-row-warn-yellow" : "",
    entry.called ? "inn-row-called" : "",
  ];
  return classes.filter(Boolean).join(" ");
}

type AdminUpdateData = Partial<{
  companyName: string | null;
  region: string | null;
  date: string;
  contactsCount: number;
  transferredCount: number;
  called: boolean;
  category: string | null;
  note: string | null;
  operatorId: number;
}>;

// One row of the ИНН stats detail — read-only by default, or fully editable
// (except the ИНН value itself) when `editable` is on, per the "массовое
// редактирование" toggle. The refresh (⟳) button always re-pulls
// название/регион from dadata for this row's ИНН, editable or not.
function StatsEntryRow({
  entry,
  editable,
  adminFields,
  dateEditable = true,
  showOperator,
  categories,
  operators,
  onSave,
  onRefresh,
  onDistribute,
  onDelete,
}: {
  entry: InnEntryWithOperator | InnEntry;
  editable: boolean;
  // Company name/region are only editable in the ADMIN bulk-edit view
  // (cleaning up bulk-imported data) — a manager's own list mirrors what
  // the personal drawer already lets them touch: ИНН/counts/called/
  // category/note, never these two.
  adminFields: boolean;
  // Date is separate from adminFields: managers may move their own entry's
  // date (the "перенос вручную" the drawer's date-nav doesn't offer) even
  // though they can't touch company/region.
  dateEditable?: boolean;
  showOperator: boolean;
  categories: string[];
  operators: UserSummary[];
  onSave: (id: number, data: AdminUpdateData) => void;
  onRefresh: (id: number) => void;
  onDistribute: (fromId: number, field: "contactsCount" | "transferredCount", values: number[]) => void;
  onDelete: (id: number) => void;
}) {
  const [companyName, setCompanyName] = useState(entry.companyName ?? "");
  const [region, setRegion] = useState(entry.region ?? "");
  const [date, setDate] = useState(toDateInputValue(entry.date));
  const [contacts, setContacts] = useState(String(entry.contactsCount));
  const [transferred, setTransferred] = useState(String(entry.transferredCount));
  const [note, setNote] = useState(entry.note ?? "");
  const [refreshing, setRefreshing] = useState(false);

  // Unlike the "seed only on interaction start" pattern used elsewhere for
  // poll-safety, this row's entry only ever changes as the direct result of
  // an action (this row's own save, a refresh, or a paste-distribute that
  // landed on a *different* row) — never a background poll — so it's safe
  // (and necessary) to mirror prop changes into local state here. Without
  // this, a neighboring row's paste-distribute updates the entry on the
  // server but this row's own input keeps showing its stale initial value.
  useEffect(() => setCompanyName(entry.companyName ?? ""), [entry.companyName]);
  useEffect(() => setRegion(entry.region ?? ""), [entry.region]);
  useEffect(() => setDate(toDateInputValue(entry.date)), [entry.date]);
  useEffect(() => setContacts(String(entry.contactsCount)), [entry.contactsCount]);
  useEffect(() => setTransferred(String(entry.transferredCount)), [entry.transferredCount]);
  useEffect(() => setNote(entry.note ?? ""), [entry.note]);

  function saveField(data: AdminUpdateData) {
    onSave(entry.id, data);
  }

  function handlePasteNumbers(field: "contactsCount" | "transferredCount") {
    return (e: ClipboardEvent<HTMLInputElement>) => {
      const values = extractNumberList(e.clipboardData.getData("text"));
      if (values.length > 1) {
        e.preventDefault();
        onDistribute(entry.id, field, values);
      }
    };
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh(entry.id);
    } finally {
      setRefreshing(false);
    }
  }

  function handleDelete() {
    if (window.confirm(`Удалить запись по ИНН ${entry.inn}?`)) onDelete(entry.id);
  }

  return (
    <tr className={rowWarningClass(entry)}>
      {showOperator && (
        <td>
          {editable ? (
            <select
              value={entry.operatorId}
              onChange={(e) => saveField({ operatorId: Number(e.target.value) })}
              title="Сменить оператора"
            >
              {/* The row's current operator may be outside the branch-scoped
                  /users list (e.g. a SUPERADMIN, who has no branchId) — add
                  them as a fallback option so the select doesn't silently
                  fall back to showing someone else. */}
              {!operators.some((o) => o.id === entry.operatorId) && (
                <option value={entry.operatorId}>{(entry as InnEntryWithOperator).operatorName}</option>
              )}
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </select>
          ) : (
            (entry as InnEntryWithOperator).operatorName
          )}
        </td>
      )}
      <td>
        {editable && dateEditable ? (
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              saveField({ date: e.target.value });
            }}
          />
        ) : (
          formatDay(entry.date)
        )}
      </td>
      <td className="inn-stats-col-name">
        {editable && adminFields ? (
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onBlur={() => saveField({ companyName: companyName.trim() || null })}
            title={companyName || undefined}
          />
        ) : (
          <span className="inn-col-truncate" title={entry.companyName || undefined}>
            {entry.companyName || "—"}
          </span>
        )}
      </td>
      <td>
        {editable && adminFields ? (
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            onBlur={() => saveField({ region: region.trim() || null })}
          />
        ) : (
          entry.region || "—"
        )}
      </td>
      <td>{entry.inn}</td>
      <td className="col-num">
        {editable ? (
          <input
            type="number"
            min={0}
            value={contacts}
            onChange={(e) => setContacts(e.target.value)}
            onPaste={handlePasteNumbers("contactsCount")}
            onBlur={() => saveField({ contactsCount: Number(contacts) || 0 })}
          />
        ) : (
          entry.contactsCount
        )}
      </td>
      <td className="col-num">
        {editable ? (
          <input
            type="number"
            min={0}
            value={transferred}
            onChange={(e) => setTransferred(e.target.value)}
            onPaste={handlePasteNumbers("transferredCount")}
            onBlur={() => saveField({ transferredCount: Number(transferred) || 0 })}
          />
        ) : (
          entry.transferredCount
        )}
      </td>
      <td className="col-num">
        {editable ? (
          <input
            type="checkbox"
            checked={entry.called}
            onChange={(e) => saveField({ called: e.target.checked })}
            title="Прозвонена?"
          />
        ) : entry.called ? (
          "да"
        ) : (
          "—"
        )}
      </td>
      <td>
        {editable ? (
          <select
            value={entry.category ?? ""}
            onChange={(e) => saveField({ category: e.target.value || null })}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          entry.category || "—"
        )}
      </td>
      <td>
        {editable ? (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => saveField({ note: note.trim() || null })}
          />
        ) : (
          entry.note || "—"
        )}
      </td>
      <td className="col-num">
        <button
          className="icon-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Обновить из dadata"
          aria-label="Обновить из dadata"
        >
          <IconRestore width={15} height={15} />
        </button>
        {editable && (
          <button className="icon-btn" onClick={handleDelete} title="Удалить" aria-label="Удалить">
            <IconTrash width={15} height={15} />
          </button>
        )}
      </td>
    </tr>
  );
}

function StatsEntriesTable({
  entries,
  editable,
  adminFields = true,
  showOperator,
  categories,
  operators,
  onSave,
  onRefresh,
  onDistribute,
  onDelete,
}: {
  entries: (InnEntryWithOperator | InnEntry)[];
  editable: boolean;
  adminFields?: boolean;
  showOperator: boolean;
  categories: string[];
  operators: UserSummary[];
  onSave: (id: number, data: AdminUpdateData) => void;
  onRefresh: (id: number) => void;
  onDistribute: (fromId: number, field: "contactsCount" | "transferredCount", values: number[]) => void;
  onDelete: (id: number) => void;
}) {
  if (entries.length === 0) return <p className="empty-state">За период записей нет.</p>;
  return (
    <div className="table-scroll">
      <table className="appeals-table stats-manager-table inn-stats-table">
        <colgroup>
          {showOperator && <col className="inn-stats-col-operator" />}
          <col className="inn-stats-col-date" />
          <col className="inn-stats-col-name" />
          <col className="inn-stats-col-region" />
          <col className="inn-stats-col-inn" />
          <col className="inn-stats-col-num" />
          <col className="inn-stats-col-num" />
          <col className="inn-stats-col-num" />
          <col className="inn-stats-col-cat" />
          <col className="inn-stats-col-note" />
          <col className="inn-stats-col-actions" />
        </colgroup>
        <thead>
          <tr>
            {showOperator && <th>Оператор</th>}
            <th>Дата</th>
            <th>Название</th>
            <th>Регион</th>
            <th>ИНН</th>
            <th className="col-num">Чел.</th>
            <th className="col-num">Передано</th>
            <th className="col-num">Прозвонена</th>
            <th>Кат.</th>
            <th>Примеч.</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <StatsEntryRow
              key={entry.id}
              entry={entry}
              editable={editable}
              adminFields={adminFields}
              showOperator={showOperator}
              categories={categories}
              operators={operators}
              onSave={onSave}
              onRefresh={onRefresh}
              onDistribute={onDistribute}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Every entry in the branch for the period, flat (not grouped by operator)
// — the "массовое редактирование" view. Editing/refresh both hit the
// ADMIN-only endpoints (/inn/admin/:id, /inn/:id/refresh) since rows here
// belong to whichever operator logged them, not the viewing admin.
function BulkEditList({
  from,
  to,
  categories,
  operators,
  search,
}: {
  from: string;
  to: string;
  categories: string[];
  operators: UserSummary[];
  search: string;
}) {
  const [entries, setEntries] = useState<InnEntryWithOperator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ entries: InnEntryWithOperator[] }>(`/inn/stats/entries?from=${from}&to=${to}`)
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [from, to]);

  function handleSave(id: number, data: AdminUpdateData) {
    api
      .patch<{ entry: InnEntryWithOperator }>(`/inn/admin/${id}`, data)
      .then((res) => setEntries((prev) => prev.map((e) => (e.id === id ? res.entry : e))))
      .catch(() => {});
  }

  function handleRefresh(id: number) {
    return api
      .post<{ entry: InnEntryWithOperator }>(`/inn/${id}/refresh`, {})
      .then((res) => setEntries((prev) => prev.map((e) => (e.id === id ? res.entry : e))))
      .catch(() => {});
  }

  // Pasting a column of numbers into one row's Чел./Передано fills that
  // field down through the following rows in list order, one value per row
  // — mirrors how pasting a column into a spreadsheet fills down from the
  // anchor cell.
  async function handleDistribute(fromId: number, field: "contactsCount" | "transferredCount", values: number[]) {
    const startIndex = entries.findIndex((e) => e.id === fromId);
    if (startIndex === -1) return;
    for (let i = 0; i < values.length && startIndex + i < entries.length; i++) {
      const target = entries[startIndex + i];
      await api
        .patch<{ entry: InnEntryWithOperator }>(`/inn/admin/${target.id}`, { [field]: values[i] })
        .then((res) => setEntries((prev) => prev.map((e) => (e.id === target.id ? res.entry : e))))
        .catch(() => {});
    }
  }

  function handleDelete(id: number) {
    api
      .delete(`/inn/admin/${id}`)
      .then(() => setEntries((prev) => prev.filter((e) => e.id !== id)))
      .catch(() => {});
  }

  if (loading) return <p className="muted">Загрузка...</p>;
  const filtered = search.trim() ? entries.filter((e) => e.inn.includes(search.trim())) : entries;
  return (
    <StatsEntriesTable
      entries={filtered}
      editable
      showOperator
      categories={categories}
      operators={operators}
      onSave={handleSave}
      onRefresh={handleRefresh}
      onDistribute={handleDistribute}
      onDelete={handleDelete}
    />
  );
}

// A regular manager's own editable entries list — same table/UX as
// BulkEditList, but scoped to the operator's own rows via the personal
// /inn/:id endpoints (own-only on the backend) instead of the ADMIN-only
// /inn/admin/:id ones, and without the operator column/reassignment or
// company/region editing (see adminFields on StatsEntryRow). Shown directly
// under the KPI cards in MineSummary — no separate "массовое
// редактирование" toggle for managers, unlike the admin view.
function MyEntriesList({
  from,
  to,
  categories,
  search,
}: {
  from: string;
  to: string;
  categories: string[];
  search: string;
}) {
  const [entries, setEntries] = useState<InnEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ entries: InnEntry[] }>(`/inn/stats/mine/entries?from=${from}&to=${to}`)
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [from, to]);

  function handleSave(id: number, data: AdminUpdateData) {
    api
      .patch<{ entry: InnEntry }>(`/inn/${id}`, data)
      .then((res) => setEntries((prev) => prev.map((e) => (e.id === id ? res.entry : e))))
      .catch(() => {});
  }

  function handleRefresh(id: number) {
    return api
      .post<{ entry: InnEntry }>(`/inn/${id}/refresh`, {})
      .then((res) => setEntries((prev) => prev.map((e) => (e.id === id ? res.entry : e))))
      .catch(() => {});
  }

  async function handleDistribute(fromId: number, field: "contactsCount" | "transferredCount", values: number[]) {
    const startIndex = entries.findIndex((e) => e.id === fromId);
    if (startIndex === -1) return;
    for (let i = 0; i < values.length && startIndex + i < entries.length; i++) {
      const target = entries[startIndex + i];
      await api
        .patch<{ entry: InnEntry }>(`/inn/${target.id}`, { [field]: values[i] })
        .then((res) => setEntries((prev) => prev.map((e) => (e.id === target.id ? res.entry : e))))
        .catch(() => {});
    }
  }

  function handleDelete(id: number) {
    api
      .delete(`/inn/${id}`)
      .then(() => setEntries((prev) => prev.filter((e) => e.id !== id)))
      .catch(() => {});
  }

  if (loading) return <p className="muted">Загрузка...</p>;
  const filtered = search.trim() ? entries.filter((e) => e.inn.includes(search.trim())) : entries;
  return (
    <StatsEntriesTable
      entries={filtered}
      editable
      adminFields={false}
      showOperator={false}
      categories={categories}
      operators={[]}
      onSave={handleSave}
      onRefresh={handleRefresh}
      onDistribute={handleDistribute}
      onDelete={handleDelete}
    />
  );
}

function OperatorEntriesList({
  operatorId,
  from,
  to,
  categories,
}: {
  operatorId: number;
  from: string;
  to: string;
  categories: string[];
}) {
  const [entries, setEntries] = useState<InnEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ entries: InnEntry[] }>(`/inn/stats/operator/${operatorId}?from=${from}&to=${to}`)
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [operatorId, from, to]);

  function handleRefresh(id: number) {
    return api
      .post<{ entry: InnEntry }>(`/inn/${id}/refresh`, {})
      .then((res) => setEntries((prev) => prev.map((e) => (e.id === id ? res.entry : e))))
      .catch(() => {});
  }

  if (loading) return <p className="muted">Загрузка...</p>;
  return (
    <StatsEntriesTable
      entries={entries}
      editable={false}
      showOperator={false}
      categories={categories}
      operators={[]}
      onSave={() => {}}
      onRefresh={handleRefresh}
      onDistribute={() => {}}
      onDelete={() => {}}
    />
  );
}

function AdminSummary({ from, to, categories }: { from: string; to: string; categories: string[] }) {
  const [summary, setSummary] = useState<InnStatsSummary | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<InnStatsSummary>(`/inn/stats/summary?from=${from}&to=${to}`)
      .then(setSummary)
      .catch(() => setSummary(null));
    setExpanded(null);
  }, [from, to]);

  function toggleOperator(operatorId: number) {
    setExpanded((prev) => (prev === operatorId ? null : operatorId));
  }

  return (
    <>
      <div className="kpi-grid">
        <Kpi value={summary?.totalEntries ?? 0} label="записей ИНН" />
        <Kpi value={summary?.totalContacts ?? 0} label="контактов" />
        <Kpi value={summary?.totalTransferred ?? 0} label="передано" />
        <Kpi value={summary?.totalRepeats ?? 0} label="повторов ИНН" />
        <Kpi value={summary?.totalCalled ?? 0} label="прозвонено" />
      </div>
      {summary && summary.byOperator.length > 0 ? (
        <div className="table-scroll">
          <table className="appeals-table stats-manager-table">
            <thead>
              <tr>
                <th>Оператор</th>
                <th className="col-num">Записей</th>
                <th className="col-num">Чел.</th>
                <th className="col-num">Передано</th>
                <th className="col-num">Повторов</th>
                <th className="col-num">Прозвонено</th>
              </tr>
            </thead>
            <tbody>
              {summary.byOperator.map((row) => (
                <Fragment key={row.operatorId}>
                  <tr className="inn-operator-row" onClick={() => toggleOperator(row.operatorId)}>
                    <td>{row.operatorName}</td>
                    <td className="col-num">{row.entries}</td>
                    <td className="col-num">{row.contacts}</td>
                    <td className="col-num">{row.transferred}</td>
                    <td className="col-num">{row.repeats}</td>
                    <td className="col-num">{row.called}</td>
                  </tr>
                  {expanded === row.operatorId && (
                    <tr>
                      <td colSpan={6}>
                        <OperatorEntriesList operatorId={row.operatorId} from={from} to={to} categories={categories} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">За выбранный период записей ИНН нет.</p>
      )}
    </>
  );
}

// Manager's own ИНН — KPI cards plus their editable entries directly below,
// with no separate "массовое редактирование" step: they only ever see and
// touch their own rows anyway, so there's nothing a toggle would protect
// against here (unlike the ADMIN branch-wide view, which stays opt-in).
function MineSummary({
  from,
  to,
  categories,
  search,
}: {
  from: string;
  to: string;
  categories: string[];
  search: string;
}) {
  const [mine, setMine] = useState<InnStatsMine | null>(null);

  useEffect(() => {
    api
      .get<InnStatsMine>(`/inn/stats/mine?from=${from}&to=${to}`)
      .then(setMine)
      .catch(() => setMine(null));
  }, [from, to]);

  return (
    <>
      <div className="kpi-grid">
        <Kpi value={mine?.totalEntries ?? 0} label="записей ИНН" />
        <Kpi value={mine?.totalContacts ?? 0} label="контактов" />
        <Kpi value={mine?.totalTransferred ?? 0} label="передано" />
        <Kpi value={mine?.totalCalled ?? 0} label="прозвонено" />
      </div>
      <MyEntriesList from={from} to={to} categories={categories} search={search} />
    </>
  );
}

// USER sees only their own ИНН log totals; ADMIN/SUPERADMIN see the summary
// for the branch currently picked in BranchSwitcher ("отдел" in this
// project has no separate entity — it is the selected branch), broken down
// by operator, with a per-operator expandable detail list. `period`/`date`/
// `bulkEdit` are owned by StatsPage (rendered next to the Обращения/ИНН tab
// switcher, centered on the page) so they live at the same level as the
// tabs rather than duplicated inside this section.
export function InnStatsSection({
  isAdmin,
  period,
  date,
  bulkEdit,
  search,
}: {
  isAdmin: boolean;
  period: InnPeriod;
  date: string;
  bulkEdit: boolean;
  search: string;
}) {
  const { from, to } = periodRange(period, date);
  const [categories, setCategories] = useState<string[]>([]);
  const [operators, setOperators] = useState<UserSummary[]>([]);

  useEffect(() => {
    api
      .get<{ options: SelectOption[] }>("/select-options")
      .then((res) =>
        setCategories(
          res.options
            .filter((o) => o.field === "INN_CATEGORY")
            .sort((a, b) => a.order - b.order)
            .map((o) => o.value)
        )
      )
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<{ users: UserSummary[] }>("/users")
      .then((res) => setOperators(res.users.filter((u) => u.active)))
      .catch(() => setOperators([]));
  }, [isAdmin]);

  return (
    <section className="stats-section">
      <p className="stats-eyebrow">{isAdmin ? "ИНН — сводка по филиалу" : "ИНН — моя статистика"}</p>
      {isAdmin && bulkEdit ? (
        <BulkEditList from={from} to={to} categories={categories} operators={operators} search={search} />
      ) : isAdmin ? (
        <AdminSummary from={from} to={to} categories={categories} />
      ) : (
        <MineSummary from={from} to={to} categories={categories} search={search} />
      )}
    </section>
  );
}
