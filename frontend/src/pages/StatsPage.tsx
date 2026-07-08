import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Appeal, DailyStat, OperatorStat } from "../types";
import { detectMobileOperator } from "../lib/mobileOperator";

function formatDay(day: string): string {
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(dateIso: string, timeSourceIso: string): string {
  const datePart = new Date(dateIso).toLocaleDateString("ru-RU");
  const timePart = new Date(timeSourceIso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function DailyChart({ data, onPick }: { data: DailyStat[]; onPick: (day: string) => void }) {
  if (data.length === 0) {
    return <p className="empty-state">Нет данных за последние 30 дней.</p>;
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
      aria-label="Обращения по дням"
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
    return <p className="empty-state">За этот день обращений нет.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="appeals-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Телефон</th>
            <th>Опер. (моб.)</th>
            <th>СМС</th>
            <th>Прием</th>
            <th>Данные клиента</th>
            <th>Госы</th>
            <th>ЦБ</th>
            <th>ФСБ</th>
            <th>Закрыв</th>
            <th>Статус</th>
            <th>Описание</th>
          </tr>
        </thead>
        <tbody>
          {appeals.map((a) => (
            <tr key={a.id}>
              <td>{formatDateTime(a.date, a.createdAt)}</td>
              <td>{a.phone}</td>
              <td>{detectMobileOperator(a.phone)}</td>
              <td>{a.smsSentBy ? `${a.smsSentBy.fullName}` : "—"}</td>
              <td>{a.intake ? "Да" : "—"}</td>
              <td className="wrap-cell">{a.clientData || "—"}</td>
              <td>{a.gov || "—"}</td>
              <td>{a.cb || "—"}</td>
              <td>{a.fsb || "—"}</td>
              <td>{a.closer || "—"}</td>
              <td>
                <span className="status-pill">{a.status}</span>
              </td>
              <td className="wrap-cell">{a.description || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsPage() {
  const [byOperator, setByOperator] = useState<OperatorStat[]>([]);
  const [byDate, setByDate] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [dayAppeals, setDayAppeals] = useState<Appeal[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    api
      .get<{ byOperator: OperatorStat[]; byDate: DailyStat[] }>("/appeals/stats")
      .then((res) => {
        setByOperator(res.byOperator);
        setByDate(res.byDate);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить статистику"))
      .finally(() => setLoading(false));
  }, []);

  function loadDay(day: string) {
    setSelectedDay(day);
    setDayLoading(true);
    api
      .get<{ appeals: Appeal[] }>(`/appeals?date=${day}`)
      .then((res) => setDayAppeals(res.appeals))
      .finally(() => setDayLoading(false));
  }

  const total = byOperator.reduce((sum, o) => sum + o.count, 0);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Статистика</h1>
        </div>
        <div className="header-actions">
          <Link to="/">← К обращениям</Link>
        </div>
      </header>

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stats-summary">
            <div className="stats-card">
              <span className="stats-card-value">{total}</span>
              <span className="muted">Всего обращений (30 дней)</span>
            </div>
          </div>

          <section className="stats-section">
            <h2>Обращения по дням (последние 30 дней) — нажмите на столбец, чтобы посмотреть список</h2>
            <div className="table-scroll stats-chart-wrap">
              <DailyChart data={byDate} onPick={loadDay} />
            </div>
          </section>

          <section className="stats-section">
            <h2>Обращения за выбранный день</h2>
            <div className="inline-form">
              <label>
                Дата
                <input type="date" value={selectedDay} onChange={(e) => loadDay(e.target.value)} />
              </label>
            </div>
            {selectedDay && (dayLoading ? <p>Загрузка...</p> : <DayAppealsTable appeals={dayAppeals} />)}
          </section>

          <section className="stats-section">
            <h2>По операторам</h2>
            {byOperator.length === 0 ? (
              <p className="empty-state">Нет данных.</p>
            ) : (
              <div className="table-scroll">
                <table className="appeals-table">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Количество обращений</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byOperator.map((o) => (
                      <tr key={o.operatorId}>
                        <td>{o.fullName}</td>
                        <td>{o.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
