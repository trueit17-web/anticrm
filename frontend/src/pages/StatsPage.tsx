import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  Appeal,
  ContactManagerStat,
  ContactRangeStats,
  DailyStat,
  OperatorStat,
  RangeStats,
  StatBucket,
  SummaryStats,
  TfTimeBucket,
} from "../types";
import { detectMobileOperator } from "../lib/mobileOperator";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconBack } from "../components/icons";
import { EmployeeNameButton } from "../components/EmployeeCard";
import { APP_BUILD, APP_VERSION } from "../data/changelog";

type Period = "today" | "week" | "custom";

interface LabeledCount {
  label: string;
  count: number;
  // Only set for the "По трубкам" (operator) breakdown — lets the row's
  // name open the employee card popup like everywhere else.
  operatorId?: number;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Monday of the week containing isoDate — weeks here always run Пн–Сб.
function mondayOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function formatDay(day: string): string {
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(dateIso: string, timeSourceIso: string): string {
  const datePart = new Date(dateIso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const timePart = new Date(timeSourceIso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function DailyChart({ data, onPick }: { data: DailyStat[]; onPick: (day: string) => void }) {
  if (data.length === 0) {
    return <p className="empty-state">Нет данных за выбранный период.</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 700;
  const height = 220;
  const padding = 28;
  const barGap = 4;
  const barWidth = (width - padding * 2) / data.length - barGap;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="stats-chart"
      role="img"
      aria-label="Трубки по дням"
    >
      {data.map((d, i) => {
        const barHeight = (d.count / max) * (height - padding * 2);
        const x = padding + i * (barWidth + barGap);
        const y = height - padding - barHeight;
        // Count label sits centered in the bar when there's room for it;
        // for short bars it moves just above so it's never squeezed.
        const fitsInsideBar = barHeight >= 18;
        const labelY = fitsInsideBar ? y + barHeight / 2 : y - 6;
        return (
          <g key={d.day} onClick={() => onPick(d.day)} style={{ cursor: "pointer" }}>
            <rect
              x={x}
              y={y}
              width={Math.max(barWidth, 1)}
              height={Math.max(barHeight, 0)}
              fill="var(--primary)"
              rx={2}
            >
              <title>
                {formatDay(d.day)}: {d.count} (нажмите, чтобы посмотреть список)
              </title>
            </rect>
            {barWidth >= 14 && (
              <text
                x={x + barWidth / 2}
                y={labelY}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline={fitsInsideBar ? "central" : "auto"}
                fill={fitsInsideBar ? "#ffffff" : "var(--primary-dark)"}
                style={{ pointerEvents: "none" }}
              >
                {d.count}
              </text>
            )}
            {(i % Math.ceil(data.length / 10 || 1) === 0 || i === data.length - 1) && (
              <text
                x={x + barWidth / 2}
                y={height - padding + 14}
                fontSize="10"
                textAnchor="middle"
                fill="var(--muted)"
              >
                {formatDay(d.day)}
              </text>
            )}
          </g>
        );
      })}
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke="var(--border)"
      />
    </svg>
  );
}

function DayAppealsTable({ appeals }: { appeals: Appeal[] }) {
  if (appeals.length === 0) {
    return <p className="empty-state">За этот день трубок нет.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="appeals-table">
        <colgroup>
          <col style={{ width: 110 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 178 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 60 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="col-center">📅 Дата</th>
            <th>📞 Телефон</th>
            <th className="col-center">📠 ТФ</th>
            <th className="col-center">📱 Опер. (моб.)</th>
            <th>🧾 Данные клиента</th>
            <th>💰 Деп.</th>
            <th className="col-center">💬 СМС</th>
            <th className="col-center">Прием</th>
            <th className="col-center">🏛️ Госы</th>
            <th className="col-center">🚦 Статус</th>
            <th>📝 Описание</th>
            <th className="col-center">🏦 ЦБ</th>
            <th className="col-center">🛡️ ФСБ</th>
            <th className="col-center">🔒 Закрыв</th>
          </tr>
        </thead>
        <tbody>
          {appeals.map((a) => (
            <tr key={a.id}>
              <td className="col-center">
                <EmployeeNameButton id={a.operator.id} fullName={a.operator.fullName} />
                <br />
                {formatDateTime(a.date, a.createdAt)}
              </td>
              <td>{a.phone}</td>
              <td className="col-center">{a.tf || "—"}</td>
              <td className="col-center">{detectMobileOperator(a.phone)}</td>
              <td className="wrap-cell" title={a.clientData ?? undefined}>
                {a.clientData || "—"}
              </td>
              <td className="wrap-cell" title={a.dep ?? undefined}>
                {a.dep || "—"}
              </td>
              <td className="col-center">{a.smsSentBy ? `${a.smsSentBy.fullName}` : "—"}</td>
              <td className="col-center">{a.intake ? "Да" : "—"}</td>
              <td className="col-center">{a.gov || "—"}</td>
              <td className="col-center">
                <span className="status-pill">{a.status}</span>
              </td>
              <td className="wrap-cell" title={a.description ?? undefined}>
                {a.description || "—"}
              </td>
              <td className="col-center">{a.cb || "—"}</td>
              <td className="col-center">{a.fsb || "—"}</td>
              <td className="col-center">{a.closer || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortableBreakdown({ title, rows }: { title: string; rows: LabeledCount[] }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);

  return (
    <div className="stats-subtable">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-state">Нет данных.</p>
      ) : (
        <table className="appeals-table">
          <tbody>
            {sorted.map((r) => (
              <tr key={r.label}>
                <td>
                  {r.operatorId !== undefined ? (
                    <EmployeeNameButton id={r.operatorId} fullName={r.label} />
                  ) : (
                    r.label
                  )}
                </td>
                <td className="col-num">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Operators with the same trubki count share one row, names comma-separated
// — otherwise a tied leaderboard turns into a long wall of near-duplicate rows.
function OperatorBreakdown({ rows }: { rows: OperatorStat[] }) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const groups: { count: number; operators: OperatorStat[] }[] = [];
  for (const r of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.count === r.count) {
      last.operators.push(r);
    } else {
      groups.push({ count: r.count, operators: [r] });
    }
  }

  return (
    <div className="stats-subtable">
      <h3>По трубкам</h3>
      {rows.length === 0 ? (
        <p className="empty-state">Нет данных.</p>
      ) : (
        <table className="appeals-table">
          <tbody>
            {groups.map((g) => (
              <tr key={g.count}>
                <td>
                  {g.operators.map((o, i) => (
                    <span key={o.operatorId}>
                      {i > 0 && ", "}
                      <EmployeeNameButton id={o.operatorId} fullName={o.fullName} />
                    </span>
                  ))}
                </td>
                <td className="col-num">{g.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TfTimeBreakdown({ rows }: { rows: TfTimeBucket[] }) {
  const sorted = [...rows].sort((a, b) => b.I + b.II + b.III + b.IV - (a.I + a.II + a.III + a.IV));

  return (
    <div className="stats-subtable">
      {rows.length === 0 ? (
        <p className="empty-state">Нет данных.</p>
      ) : (
        <table className="appeals-table">
          <thead>
            <tr>
              <th>ТФ</th>
              <th className="col-num" title="8:00–10:14">I</th>
              <th className="col-num" title="10:15–12:59">II</th>
              <th className="col-num" title="13:00–15:14">III</th>
              <th className="col-num" title="15:15–20:00">IV</th>
              <th className="col-num">Итого</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.value}>
                <td className="wrap-cell" title={r.value}>
                  {r.value}
                </td>
                <td className="col-num">{r.I}</td>
                <td className="col-num">{r.II}</td>
                <td className="col-num">{r.III}</td>
                <td className="col-num">{r.IV}</td>
                <td className="col-num">{r.I + r.II + r.III + r.IV}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// A single KPI tile — big display-font numeral with a colored accent stripe.
// `accent` maps to a .kpi--* modifier so the stripe/tint matches the metric's
// meaning (green for дозвон, red for отказ, etc.).
function Kpi({
  value,
  label,
  sub,
  accent = "gold",
}: {
  value: number | string;
  label: string;
  sub?: string;
  accent?: "gold" | "success" | "danger" | "muted" | "info";
}) {
  return (
    <div className={`kpi kpi--${accent}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

// Horizontal proportion bar of the period's final outcomes (дозвон / недозвон
// / отказ) — a quick read on the shape of the calling before diving into the
// per-manager numbers.
function ConversionBar({ reached, notReached, declined }: { reached: number; notReached: number; declined: number }) {
  const total = reached + notReached + declined;
  if (total === 0) {
    return <p className="empty-state">За выбранный период обработанных контактов нет.</p>;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  const conversion = Math.round((reached / total) * 100);

  return (
    <div className="conv">
      <div className="conv-head">
        <span className="conv-rate">{conversion}%</span>
        <span className="muted">конверсия в дозвон ({reached} из {total} обработанных)</span>
      </div>
      <div className="conv-bar" role="img" aria-label={`Дозвон ${reached}, недозвон ${notReached}, отказ ${declined}`}>
        {reached > 0 && <div className="conv-seg conv-seg--reached" style={{ width: pct(reached) }} title={`Дозвон: ${reached}`} />}
        {notReached > 0 && (
          <div className="conv-seg conv-seg--notReached" style={{ width: pct(notReached) }} title={`Недозвон: ${notReached}`} />
        )}
        {declined > 0 && <div className="conv-seg conv-seg--declined" style={{ width: pct(declined) }} title={`Отказ: ${declined}`} />}
      </div>
      <div className="conv-legend">
        <span><i className="conv-dot conv-dot--reached" />Дозвон {reached}</span>
        <span><i className="conv-dot conv-dot--notReached" />Недозвон {notReached}</span>
        <span><i className="conv-dot conv-dot--declined" />Отказ {declined}</span>
      </div>
    </div>
  );
}

function ManagerCallTable({ rows }: { rows: ContactManagerStat[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">За выбранный период никто не брал контакты в работу.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="appeals-table stats-manager-table">
        <thead>
          <tr>
            <th>Менеджер</th>
            <th className="col-num" title="Переведено в трубку">Дозвон</th>
            <th className="col-num">Недозвон</th>
            <th className="col-num">Отказ</th>
            <th className="col-num" title="Отмечено «Перезвонить»">Перезвон</th>
            <th className="col-num" title="Всего взято в работу за период">Всего</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td>
                <EmployeeNameButton id={r.userId} fullName={r.fullName} />
              </td>
              <td className="col-num stat-reached">{r.reached || "—"}</td>
              <td className="col-num">{r.notReached || "—"}</td>
              <td className="col-num">{r.declined || "—"}</td>
              <td className="col-num">{r.callback || "—"}</td>
              <td className="col-num stat-total">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CallStatsSection({ stats }: { stats: ContactRangeStats }) {
  return (
    <section className="stats-section">
      <p className="stats-eyebrow">Прозвон</p>

      <div className="kpi-grid kpi-grid--calls">
        <Kpi value={stats.queueNew} label="в очереди" sub="ждут звонка сейчас" accent="info" />
        <Kpi value={stats.queueInWork} label="в работе" sub="взяты, не обработаны" accent="muted" />
        <Kpi value={stats.reached} label="дозвонов" sub="за период → трубки" accent="success" />
        <Kpi value={stats.notReached} label="недозвонов" sub="за период" accent="muted" />
        <Kpi value={stats.declined} label="отказов" sub="за период" accent="danger" />
        <Kpi value={stats.queueTotal} label="всего в базе" sub="контактов филиала" accent="gold" />
      </div>

      <div className="stats-panels stats-panels--calls">
        <div className="stats-panel">
          <div className="stats-subtable">
            <h3>Итог обзвона за период</h3>
            <ConversionBar reached={stats.reached} notReached={stats.notReached} declined={stats.declined} />
          </div>
        </div>
        <div className="stats-panel">
          <div className="stats-subtable">
            <h3>По менеджерам</h3>
            <ManagerCallTable rows={stats.byManager} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function StatsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(todayInputValue());
  const [customTo, setCustomTo] = useState(todayInputValue());

  const [summary, setSummary] = useState<SummaryStats>({ today: 0, week: 0, total: 0 });
  const [byOperator, setByOperator] = useState<OperatorStat[]>([]);
  const [byGov, setByGov] = useState<StatBucket[]>([]);
  const [byStatus, setByStatus] = useState<StatBucket[]>([]);
  const [byDate, setByDate] = useState<DailyStat[]>([]);
  const [byTf, setByTf] = useState<TfTimeBucket[]>([]);
  // Прозвон stats live behind the per-branch module toggle: a 403 (module off)
  // or any other failure just hides the block rather than erroring the page.
  const [callStats, setCallStats] = useState<ContactRangeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [dayAppeals, setDayAppeals] = useState<Appeal[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      return;
    }
    const weekMonday = mondayOfWeek(todayInputValue());
    const from = period === "today" ? todayInputValue() : period === "week" ? weekMonday : customFrom;
    const to =
      period === "custom" ? addDays(customTo, 1) : period === "week" ? addDays(weekMonday, 6) : addDays(todayInputValue(), 1);

    setLoading(true);
    setError(null);
    api
      .get<RangeStats>(`/appeals/stats?from=${from}&to=${to}`)
      .then((res) => {
        setByOperator(res.byOperator);
        setByGov(res.byGov);
        setByStatus(res.byStatus);
        setByDate(res.byDate);
        setByTf(res.byTf);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить статистику"))
      .finally(() => setLoading(false));

    // Same range as the appeals stats above. Hidden (null) when the Прозвон
    // module is off for this branch (403) or the request otherwise fails.
    api
      .get<ContactRangeStats>(`/contacts/stats?from=${from}&to=${to}`)
      .then(setCallStats)
      .catch(() => setCallStats(null));
  }, [period, customFrom, customTo]);

  // Always-visible today/week/all-time counts — independent of whatever
  // period the chart/breakdowns below are scoped to.
  useEffect(() => {
    api
      .get<SummaryStats>("/appeals/summary")
      .then(setSummary)
      .catch(() => {});
  }, []);

  function loadDay(day: string) {
    setSelectedDay(day);
    setDayLoading(true);
    api
      .get<{ appeals: Appeal[] }>(`/appeals?date=${day}`)
      .then((res) => setDayAppeals(res.appeals))
      .finally(() => setDayLoading(false));
  }

  // Picking a day directly (as opposed to clicking a bar already inside the
  // current period) also switches Период to that single day — otherwise the
  // summary/chart above stay tied to "Сегодня"/"Неделя" and can show "Нет
  // данных" even though the day being looked up has appeals.
  function pickDay(day: string) {
    if (!day) return;
    setPeriod("custom");
    setCustomFrom(day);
    setCustomTo(day);
    loadDay(day);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="page-title-row">
            <h1>Статистика</h1>
            <BranchSwitcher />
          </div>
        </div>
        <div className="header-actions">
          <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
            <IconBack />
          </Link>
        </div>
      </header>

      <div className="stats-toolbar">
        <div className="inline-form">
          <label>
            Период
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="today">Сегодня</option>
              <option value="week">Неделя</option>
              <option value="custom">Период</option>
            </select>
          </label>
          {period === "custom" && (
            <>
              <label>
                С
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>
                По
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </>
          )}
          <label>
            За день
            <input type="date" value={selectedDay} onChange={(e) => pickDay(e.target.value)} />
          </label>
        </div>

        <div className="stats-summary kpi-grid">
          <Kpi value={summary.today} label="трубок сегодня" accent="gold" />
          <Kpi value={summary.week} label="трубок на этой неделе" accent="gold" />
          <Kpi value={summary.total} label="трубок за всё время" accent="muted" />
        </div>
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <section className="stats-section">
            <p className="stats-eyebrow">Трубки</p>
            <h2>Трубки по дням — нажмите на столбец, чтобы посмотреть список</h2>
            <div className="table-scroll stats-chart-wrap">
              <DailyChart data={byDate} onPick={loadDay} />
            </div>
          </section>

          {selectedDay && (
            <section className="stats-section">
              <h2>Трубки за {formatDay(selectedDay)}</h2>
              {dayLoading ? <p>Загрузка...</p> : <DayAppealsTable appeals={dayAppeals} />}
            </section>
          )}

          <section className="stats-section">
            <div className="stats-panels">
              <div className="stats-panel">
                <OperatorBreakdown rows={byOperator} />
              </div>
              <div className="stats-panel-column">
                <div className="stats-panel">
                  <SortableBreakdown
                    title="По Госам"
                    rows={byGov.map((g) => ({ label: g.value, count: g.count }))}
                  />
                </div>
                <div className="stats-panel">
                  <TfTimeBreakdown rows={byTf} />
                </div>
              </div>
              <div className="stats-panel">
                <SortableBreakdown
                  title="По Статусам"
                  rows={byStatus.map((s) => ({ label: s.value, count: s.count }))}
                />
              </div>
            </div>
          </section>

          {callStats && <CallStatsSection stats={callStats} />}
        </>
      )}

      <footer className="stats-footer muted">
        Версия {APP_VERSION} (сборка {APP_BUILD}) · <Link to="/changelog">История версий и обновлений</Link>
      </footer>
    </div>
  );
}
