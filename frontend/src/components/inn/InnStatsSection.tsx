import { Fragment, useEffect, useState } from "react";
import { api } from "../../api/client";
import { InnEntry, InnStatsMine, InnStatsSummary } from "../../types";

type InnPeriod = "day" | "week" | "month";

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

function periodRange(period: InnPeriod): { from: string; to: string } {
  const today = todayInputValue();
  if (period === "day") return { from: today, to: addDays(today, 1) };
  if (period === "week") return { from: addDays(today, -6), to: addDays(today, 1) };
  return { from: addDays(today, -29), to: addDays(today, 1) };
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function Kpi({ value, label }: { value: number; label: string }) {
  return (
    <div className="kpi kpi--gold">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

function OperatorEntriesList({ entries }: { entries: InnEntry[] }) {
  if (entries.length === 0) return <p className="empty-state">За период записей нет.</p>;
  return (
    <div className="table-scroll">
      <table className="appeals-table stats-manager-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Название</th>
            <th>Регион</th>
            <th>ИНН</th>
            <th className="col-num">Контактов</th>
            <th className="col-num">Передано</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={
                entry.warningLevel === "red"
                  ? "inn-row-warn-red"
                  : entry.warningLevel === "yellow"
                    ? "inn-row-warn-yellow"
                    : ""
              }
            >
              <td>{formatDay(entry.date)}</td>
              <td>{entry.companyName || "—"}</td>
              <td>{entry.region || "—"}</td>
              <td>{entry.inn}</td>
              <td className="col-num">{entry.contactsCount}</td>
              <td className="col-num">{entry.transferredCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminSummary({ from, to }: { from: string; to: string }) {
  const [summary, setSummary] = useState<InnStatsSummary | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [operatorEntries, setOperatorEntries] = useState<Record<number, InnEntry[]>>({});
  const [loadingOperator, setLoadingOperator] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<InnStatsSummary>(`/inn/stats/summary?from=${from}&to=${to}`)
      .then(setSummary)
      .catch(() => setSummary(null));
    setExpanded(null);
    setOperatorEntries({});
  }, [from, to]);

  function toggleOperator(operatorId: number) {
    if (expanded === operatorId) {
      setExpanded(null);
      return;
    }
    setExpanded(operatorId);
    if (!operatorEntries[operatorId]) {
      setLoadingOperator(operatorId);
      api
        .get<{ entries: InnEntry[] }>(`/inn/stats/operator/${operatorId}?from=${from}&to=${to}`)
        .then((res) => setOperatorEntries((prev) => ({ ...prev, [operatorId]: res.entries })))
        .catch(() => setOperatorEntries((prev) => ({ ...prev, [operatorId]: [] })))
        .finally(() => setLoadingOperator(null));
    }
  }

  return (
    <>
      <div className="kpi-grid">
        <Kpi value={summary?.totalEntries ?? 0} label="записей ИНН" />
        <Kpi value={summary?.totalContacts ?? 0} label="контактов" />
        <Kpi value={summary?.totalTransferred ?? 0} label="передано" />
        <Kpi value={summary?.totalRepeats ?? 0} label="повторов ИНН" />
      </div>
      {summary && summary.byOperator.length > 0 ? (
        <div className="table-scroll">
          <table className="appeals-table stats-manager-table">
            <thead>
              <tr>
                <th>Оператор</th>
                <th className="col-num">Записей</th>
                <th className="col-num">Контактов</th>
                <th className="col-num">Передано</th>
                <th className="col-num">Повторов</th>
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
                  </tr>
                  {expanded === row.operatorId && (
                    <tr>
                      <td colSpan={5}>
                        {loadingOperator === row.operatorId ? (
                          <p className="muted">Загрузка...</p>
                        ) : (
                          <OperatorEntriesList entries={operatorEntries[row.operatorId] ?? []} />
                        )}
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

function MineSummary({ from, to }: { from: string; to: string }) {
  const [mine, setMine] = useState<InnStatsMine | null>(null);

  useEffect(() => {
    api
      .get<InnStatsMine>(`/inn/stats/mine?from=${from}&to=${to}`)
      .then(setMine)
      .catch(() => setMine(null));
  }, [from, to]);

  return (
    <div className="kpi-grid">
      <Kpi value={mine?.totalEntries ?? 0} label="записей ИНН" />
      <Kpi value={mine?.totalContacts ?? 0} label="контактов" />
      <Kpi value={mine?.totalTransferred ?? 0} label="передано" />
    </div>
  );
}

// USER sees only their own ИНН log totals; ADMIN/SUPERADMIN see the summary
// for the branch currently picked in BranchSwitcher ("отдел" in this
// project has no separate entity — it is the selected branch), broken down
// by operator, with a per-operator expandable detail list and its own
// день/неделя/месяц period (independent of the "Обращения" tab's period).
export function InnStatsSection({ isAdmin }: { isAdmin: boolean }) {
  const [period, setPeriod] = useState<InnPeriod>("day");
  const { from, to } = periodRange(period);

  return (
    <section className="stats-section">
      <div className="stats-eyebrow-row">
        <p className="stats-eyebrow">{isAdmin ? "ИНН — сводка по филиалу" : "ИНН — моя статистика"}</p>
        <div className="inline-form">
          <label>
            Период
            <select value={period} onChange={(e) => setPeriod(e.target.value as InnPeriod)}>
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
          </label>
        </div>
      </div>
      {isAdmin ? <AdminSummary from={from} to={to} /> : <MineSummary from={from} to={to} />}
    </section>
  );
}
