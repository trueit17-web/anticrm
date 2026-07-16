import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Appeal, DailyStat, OperatorStat, RangeStats, StatBucket } from "../types";
import { detectMobileOperator } from "../lib/mobileOperator";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconBack } from "../components/icons";

type Period = "today" | "week" | "custom";

interface LabeledCount {
  label: string;
  count: number;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
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
          <col style={{ width: 130 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 160 }} />
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
                {a.operator.fullName}
                <br />
                {formatDateTime(a.date, a.createdAt)}
              </td>
              <td>{a.phone}</td>
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
                <td>{r.label}</td>
                <td className="col-num">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function StatsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(todayInputValue());
  const [customTo, setCustomTo] = useState(todayInputValue());

  const [total, setTotal] = useState(0);
  const [byOperator, setByOperator] = useState<OperatorStat[]>([]);
  const [byGov, setByGov] = useState<StatBucket[]>([]);
  const [byStatus, setByStatus] = useState<StatBucket[]>([]);
  const [byDate, setByDate] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [dayAppeals, setDayAppeals] = useState<Appeal[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      return;
    }
    const from = period === "today" ? todayInputValue() : period === "week" ? addDays(todayInputValue(), -6) : customFrom;
    const to = period === "custom" ? addDays(customTo, 1) : addDays(todayInputValue(), 1);

    setLoading(true);
    setError(null);
    api
      .get<RangeStats>(`/appeals/stats?from=${from}&to=${to}`)
      .then((res) => {
        setTotal(res.total);
        setByOperator(res.byOperator);
        setByGov(res.byGov);
        setByStatus(res.byStatus);
        setByDate(res.byDate);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить статистику"))
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo]);

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

  const periodLabel = period === "today" ? "сегодня" : period === "week" ? "7 дней" : "период";

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Статистика</h1>
        </div>
        <div className="header-actions">
          <BranchSwitcher />
          <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
            <IconBack />
          </Link>
        </div>
      </header>

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

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stats-summary">
            <div className="stats-card">
              <span className="stats-card-value">{total}</span>
              <span className="muted">Всего трубок ({periodLabel})</span>
            </div>
          </div>

          <section className="stats-section">
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
                <SortableBreakdown
                  title="По трубкам"
                  rows={byOperator.map((o) => ({ label: o.fullName, count: o.count }))}
                />
              </div>
              <div className="stats-panel">
                <SortableBreakdown
                  title="По Госам"
                  rows={byGov.map((g) => ({ label: g.value, count: g.count }))}
                />
              </div>
              <div className="stats-panel">
                <SortableBreakdown
                  title="По Статусам"
                  rows={byStatus.map((s) => ({ label: s.value, count: s.count }))}
                />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
