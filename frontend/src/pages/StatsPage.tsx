import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import {
  Appeal,
  Branch,
  ContactManagerStat,
  ContactRangeStats,
  DailyStat,
  OperatorStat,
  PetConfig,
  RangeStats,
  StatBucket,
  SummaryStats,
  TfTimeBucket,
  WalletStats,
} from "../types";
import { useAuth } from "../auth/AuthContext";
import { detectMobileOperator } from "../lib/mobileOperator";
import { formatMoney } from "../lib/money";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconBack, IconX } from "../components/icons";
import { EmployeeNameButton } from "../components/EmployeeCard";
import { PetStatsAssistant } from "../components/pet/PetStatsAssistant";
import { InnStatsSection } from "../components/inn/InnStatsSection";
import { AppShell } from "../components/shell/AppShell";
import { QuickStatsTiles } from "../components/shell/QuickStatsPanel";
import { APP_BUILD, APP_VERSION } from "../data/changelog";
import { getActiveBranchId } from "../api/client";

type Period = "today" | "week" | "month" | "custom";

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

function firstDayOfMonth(isoDate: string): string {
  return isoDate.slice(0, 7) + "-01";
}

function formatDay(day: string): string {
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function DailyChart({
  data,
  onPick,
  enhanced,
}: {
  data: DailyStat[];
  onPick: (day: string) => void;
  enhanced?: boolean;
}) {
  if (data.length === 0) {
    return <p className="empty-state">Нет данных за выбранный период.</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 700;
  const height = 220;
  const padding = 28;
  // The new interface's chart adds y-axis value labels, which need a bit
  // more breathing room on the left than the classic chart's bars alone.
  const leftPadding = enhanced ? 40 : padding;
  const barGap = 4;
  const barWidth = (width - leftPadding - padding) / data.length - barGap;
  const plotTop = padding;
  const plotBottom = height - padding;
  const plotHeight = plotBottom - plotTop;

  const bars = data.map((d, i) => {
    const barHeight = (d.count / max) * plotHeight;
    const x = leftPadding + i * (barWidth + barGap);
    const y = plotBottom - barHeight;
    return { day: d.day, count: d.count, x, y, barHeight, cx: x + barWidth / 2 };
  });

  // Purely decorative trend overlay (line + soft fill under it) tracing the
  // same bar tops — only drawn for the new interface, and only once there's
  // more than one point to actually trace a trend across.
  const trendPoints = bars.map((b) => `${b.cx},${b.y}`).join(" L");
  const areaPath = `M${trendPoints} L${bars[bars.length - 1].cx},${plotBottom} L${bars[0].cx},${plotBottom} Z`;

  const gridLines = enhanced ? 4 : 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="stats-chart"
        role="img"
        aria-label="Трубки по дням"
      >
        {enhanced &&
          Array.from({ length: gridLines + 1 }, (_, i) => {
            const y = plotTop + (plotHeight / gridLines) * i;
            const value = Math.round(max - (max / gridLines) * i);
            return (
              <g key={i}>
                <line x1={leftPadding} y1={y} x2={width - padding} y2={y} stroke="var(--border)" strokeOpacity={0.6} />
                <text x={leftPadding - 6} y={y + 3} fontSize="9" textAnchor="end" fill="var(--muted)">
                  {value}
                </text>
              </g>
            );
          })}

        {enhanced && bars.length > 1 && (
          <>
            <path d={areaPath} fill="var(--primary)" fillOpacity={0.14} stroke="none" />
            <path d={`M${trendPoints}`} fill="none" stroke="var(--primary-dark)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {bars.map((b, i) => {
          const isLast = i === bars.length - 1;
          // Count label sits centered in the bar when there's room for it;
          // for short bars it moves just above so it's never squeezed.
          const fitsInsideBar = b.barHeight >= 18;
          const labelY = fitsInsideBar ? b.y + b.barHeight / 2 : b.y - 6;
          return (
            <g key={b.day} onClick={() => onPick(b.day)} style={{ cursor: "pointer" }}>
              <rect
                x={b.x}
                y={b.y}
                width={Math.max(barWidth, 1)}
                height={Math.max(b.barHeight, 0)}
                fill="var(--primary)"
                fillOpacity={enhanced && !isLast ? 0.55 : 1}
                rx={enhanced ? 4 : 2}
              >
                <title>
                  {formatDay(b.day)}: {b.count} (нажмите, чтобы посмотреть список)
                </title>
              </rect>
              {barWidth >= 14 && (
                <text
                  x={b.cx}
                  y={labelY}
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline={fitsInsideBar ? "central" : "auto"}
                  fill={fitsInsideBar ? "#ffffff" : "var(--primary-dark)"}
                  style={{ pointerEvents: "none" }}
                >
                  {b.count}
                </text>
              )}
              {(i % Math.ceil(data.length / 10 || 1) === 0 || isLast) && (
                <text
                  x={b.cx}
                  y={height - padding + 14}
                  fontSize="10"
                  fontWeight={enhanced && isLast ? 700 : undefined}
                  textAnchor="middle"
                  fill={enhanced && isLast ? "var(--text)" : "var(--muted)"}
                >
                  {formatDay(b.day)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={leftPadding} y1={plotBottom} x2={width - padding} y2={plotBottom} stroke="var(--border)" />
      </svg>
    </div>
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
            <th>ФИО + ДР</th>
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
                {new Date(a.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
              </td>
              <td>{a.phone}</td>
              <td className="col-center">{a.tf || "—"}</td>
              <td className="col-center">{detectMobileOperator(a.phone)}</td>
              <td className="wrap-cell" title={a.clientData ?? undefined}>
                {a.clientData || "—"}
              </td>
              <td className="wrap-cell" title={a.dep ?? undefined}>
                {formatMoney(a.dep)}
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

// Cycled per row for the new interface's colored progress bars — reuses the
// same accent hues as the KPI tiles elsewhere on this page.
const ROW_BAR_COLORS = ["var(--primary)", "#3d6ea5", "#3f8f68", "#a8a494", "#c8493c"];

function SortableBreakdown({
  title,
  rows,
  enhanced,
}: {
  title: string;
  rows: LabeledCount[];
  enhanced?: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((r) => r.count), 1);

  return (
    <div className="stats-subtable">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-state">Нет данных.</p>
      ) : enhanced ? (
        <div className="breakdown-bars">
          {sorted.map((r, i) => (
            <div className="gov-row" key={r.label}>
              <div
                className="gov-row-fill"
                style={{ width: `${(r.count / max) * 100}%`, background: ROW_BAR_COLORS[i % ROW_BAR_COLORS.length] }}
              />
              <div className="gov-row-content">
                <div className="gov-label">
                  {r.operatorId !== undefined ? (
                    <EmployeeNameButton id={r.operatorId} fullName={r.label} />
                  ) : (
                    r.label
                  )}
                </div>
                <div className="gov-count">{r.count}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className="appeals-table">
          <colgroup>
            <col style={{ width: "70%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>
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
function OperatorBreakdown({ rows, enhanced }: { rows: OperatorStat[]; enhanced?: boolean }) {
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
  const max = Math.max(...groups.map((g) => g.count), 1);

  return (
    <div className="stats-subtable">
      <h3>По трубкам</h3>
      {rows.length === 0 ? (
        <p className="empty-state">Нет данных.</p>
      ) : enhanced ? (
        <div className="breakdown-bars">
          {groups.map((g) => (
            <div className="leader-row" key={g.count}>
              <div className="leader-row-fill" style={{ width: `${(g.count / max) * 100}%` }} />
              <div className="leader-row-content">
                <div className="leader-av">{g.operators[0].fullName.charAt(0).toUpperCase()}</div>
                <div className="leader-name">
                  {g.operators.map((o, i) => (
                    <span key={o.operatorId}>
                      {i > 0 && ", "}
                      <EmployeeNameButton id={o.operatorId} fullName={o.fullName} />
                    </span>
                  ))}
                </div>
                <div className="leader-count">{g.count}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className="appeals-table">
          <colgroup>
            <col style={{ width: "90%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>
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
          <colgroup>
            <col style={{ width: "35%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
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

// Horizontal proportion bar of the period's final dispositions — a quick read
// on the shape of the calling before diving into the per-manager numbers. The
// conversion % is дозвон over all handled contacts.
function ConversionBar({ stats }: { stats: ContactRangeStats }) {
  const segments = [
    { key: "reached", label: "Передал", value: stats.reached },
    { key: "notReached", label: "Недозвон", value: stats.notReached },
    { key: "answeringMachine", label: "АО", value: stats.answeringMachine },
    { key: "notPushed", label: "Недожал", value: stats.notPushed },
    { key: "skipOnCode", label: "Скип на коде", value: stats.skipOnCode },
  ] as const;

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <p className="empty-state">За выбранный период обработанных контактов нет.</p>;
  }
  const conversion = Math.round((stats.reached / total) * 100);

  return (
    <div className="conv">
      <div className="conv-head">
        <span className="conv-rate">{conversion}%</span>
        <span className="muted">
          конверсия — передал ({stats.reached} из {total} обработанных)
        </span>
      </div>
      <div className="conv-bar" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {segments.map(
          (s) =>
            s.value > 0 && (
              <div
                key={s.key}
                className={`conv-seg conv-seg--${s.key}`}
                style={{ width: `${(s.value / total) * 100}%` }}
                title={`${s.label}: ${s.value}`}
              />
            )
        )}
      </div>
      <div className="conv-legend">
        {segments.map((s) => (
          <span key={s.key}>
            <i className={`conv-dot conv-dot--${s.key}`} />
            {s.label} {s.value}
          </span>
        ))}
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
        <colgroup>
          <col style={{ width: "28%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Менеджер</th>
            <th className="col-num" title="Переведено в трубку">Передал</th>
            <th className="col-num">Недозвон</th>
            <th className="col-num">АО</th>
            <th className="col-num" title="Недожал">Недож.</th>
            <th className="col-num" title="Скип на коде">Скип</th>
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
              <td className="col-num">{r.answeringMachine || "—"}</td>
              <td className="col-num">{r.notPushed || "—"}</td>
              <td className="col-num">{r.skipOnCode || "—"}</td>
              <td className="col-num stat-total">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatUsdt(amount: number): string {
  return `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} USDT`;
}

function shortAddress(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
}

// Distinct colors for recipients, shared between the donut and the table dots.
const WALLET_COLORS = ["#3f8f68", "#cf9a44", "#3d6ea5", "#c8493c", "#7f5aa8", "#c98a3a", "#4a9d9a", "#9a7fa8"];

function WalletDonut({ stats }: { stats: WalletStats }) {
  const total = stats.total;
  const cx = 80;
  const cy = 80;
  const r = 58;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox="0 0 160 160" className="wallet-donut" role="img" aria-label="Распределение по получателям">
      {total > 0 ? (
        stats.byRecipient.map((rec, i) => {
          const frac = rec.amount / total;
          const dash = frac * circ;
          const seg = (
            <circle
              key={rec.name}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={WALLET_COLORS[i % WALLET_COLORS.length]}
              strokeWidth={22}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>{`${rec.name}: ${formatUsdt(rec.amount)}`}</title>
            </circle>
          );
          offset += dash;
          return seg;
        })
      ) : (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(33,30,23,0.1)" strokeWidth={22} />
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" className="wallet-donut-total">
        {Math.round(total).toLocaleString("ru-RU")}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="wallet-donut-unit">
        USDT
      </text>
    </svg>
  );
}

function WalletStatsSection({ stats }: { stats: WalletStats }) {
  return (
    <section className="stats-section">
      <p className="stats-eyebrow">Считать кош</p>

      {stats.sources.length === 0 ? (
        <p className="empty-state">
          Кошельки не указаны — задайте их в Админке (вкладка «Считать кош»).
        </p>
      ) : (
        <>
          {stats.byRecipient.length === 0 ? (
            <p className="empty-state">За выбранный период исходящих переводов известным получателям нет.</p>
          ) : (
            <>
              <p className="muted wallet-caption">
                {stats.sources.length === 1 ? (
                  <>
                    Кошелёк: <span title={stats.sources[0]}>{shortAddress(stats.sources[0])}</span>
                  </>
                ) : (
                  <span title={stats.sources.join("\n")}>Кошельков: {stats.sources.length}</span>
                )}{" "}
                · исходящие USDT (TRC-20) с Tronscan
              </p>
              <div className="wallet-panels">
                <div className="stats-panel wallet-diagram">
                  <WalletDonut stats={stats} />
                </div>
                <div className="stats-panel wallet-table">
                  <div className="stats-subtable">
                    <h3>По получателям</h3>
                    <div className="table-scroll">
                      <table className="appeals-table stats-manager-table">
                        <thead>
                          <tr>
                            <th>Получатель</th>
                            <th className="col-num">Сумма</th>
                            <th className="col-num">Транз.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.byRecipient.map((r, i) => (
                            <tr key={r.name}>
                              <td>
                                <i
                                  className="wallet-dot"
                                  style={{ background: WALLET_COLORS[i % WALLET_COLORS.length] }}
                                />
                                {r.name}
                              </td>
                              <td className="col-num stat-total">{formatUsdt(r.amount)}</td>
                              <td className="col-num">{r.count}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Итого</td>
                            <td className="col-num stat-total">{formatUsdt(stats.total)}</td>
                            <td className="col-num">{stats.count}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {stats.suggestedHubs.length > 0 && (
            <div className="wallet-suggestions">
              <p className="muted">
                Возможные хабы (несколько неопознанных адресов пересылают сюда) — добавьте как «Хаб» в
                Админке, чтобы учитывать автоматически:
              </p>
              <ul>
                {stats.suggestedHubs.map((h) => (
                  <li key={h.address}>
                    <code>{h.address}</code> — {h.fromCount} адр.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CallStatsSection({ stats }: { stats: ContactRangeStats }) {
  return (
    <section className="stats-section">
      <p className="stats-eyebrow">Прозвон</p>

      <div className="kpi-grid kpi-grid--calls">
        <Kpi value={stats.queueNew} label="в очереди" sub="ждут звонка сейчас" accent="info" />
        <Kpi value={stats.reached} label="передал" sub="за период → трубки" accent="success" />
        <Kpi value={stats.notReached} label="недозвонов" sub="за период" accent="muted" />
        <Kpi value={stats.answeringMachine} label="АО" sub="автоответчик" accent="muted" />
        <Kpi value={stats.notPushed} label="недожал" sub="за период" accent="muted" />
        <Kpi value={stats.skipOnCode} label="скип на коде" sub="за период" accent="muted" />
        <Kpi value={stats.queueTotal} label="всего в базе" sub="контактов филиала" accent="gold" />
      </div>

      <div className="stats-panels stats-panels--calls">
        <div className="stats-panel">
          <div className="stats-subtable">
            <h3>Итог обзвона за период</h3>
            <ConversionBar stats={stats} />
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
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"appeals" | "inn">(
    searchParams.get("tab") === "inn" ? "inn" : "appeals"
  );
  // The rail's "Журнал ИНН" link only changes the query string while already
  // on this page — react to that instead of relying on a remount.
  useEffect(() => {
    if (searchParams.get("tab") === "inn") setActiveTab("inn");
  }, [searchParams]);
  const [innPeriod, setInnPeriod] = useState<"date" | "week" | "month">("date");
  const [innStatsDate, setInnStatsDate] = useState(todayInputValue());
  const [innBulkEdit, setInnBulkEdit] = useState(false);
  const [innSearch, setInnSearch] = useState("");
  // Defaults to disabled — unlike other flags on this page there's no
  // "assume enabled while loading" concern, since the tab simply appears
  // once /branches/mine resolves (same load pattern as ContactsPage).
  const [innModuleEnabled, setInnModuleEnabled] = useState(false);

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
  // "Считать кош" — admin-only; hidden (null) when the module is off (403),
  // Tronscan is unreachable, or the user isn't an admin.
  const [walletStats, setWalletStats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [dayAppeals, setDayAppeals] = useState<Appeal[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  // Total for the equal-length window immediately before the current one —
  // powers the new interface's "▲/▼ X% к прошлому периоду" badge on the
  // chart. null while loading/unavailable, in which case the badge is
  // simply not shown rather than guessing.
  const [prevPeriodTotal, setPrevPeriodTotal] = useState<number | null>(null);

  const [petConfig, setPetConfig] = useState<PetConfig | null>(null);

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      return;
    }
    const weekMonday = mondayOfWeek(todayInputValue());
    const monthStart = firstDayOfMonth(todayInputValue());
    const from =
      period === "today" ? todayInputValue() : period === "week" ? weekMonday : period === "month" ? monthStart : customFrom;
    const to =
      period === "custom"
        ? addDays(customTo, 1)
        : period === "week"
          ? addDays(weekMonday, 6)
          : addDays(todayInputValue(), 1);

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

    // Equal-length window immediately before [from, to) — real data, no
    // fabricated trend.
    const lengthMs = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
    const prevTo = from;
    const prevFrom = new Date(new Date(`${from}T00:00:00Z`).getTime() - lengthMs).toISOString().slice(0, 10);
    api
      .get<RangeStats>(`/appeals/stats?from=${prevFrom}&to=${prevTo}`)
      .then((res) => setPrevPeriodTotal(res.byDate.reduce((sum, d) => sum + d.count, 0)))
      .catch(() => setPrevPeriodTotal(null));

    // Same range as the appeals stats above. Hidden (null) when the Прозвон
    // module is off for this branch (403) or the request otherwise fails.
    api
      .get<ContactRangeStats>(`/contacts/stats?from=${from}&to=${to}`)
      .then(setCallStats)
      .catch(() => setCallStats(null));

    // "Считать кош" — admin only. Same range. Hidden on 403 (module off),
    // Tronscan error, or non-admin.
    if (isAdmin) {
      api
        .get<WalletStats>(`/wallet/stats?from=${from}&to=${to}`)
        .then(setWalletStats)
        .catch(() => setWalletStats(null));
    } else {
      setWalletStats(null);
    }
  }, [period, customFrom, customTo]);

  // Always-visible today/week/all-time counts — independent of whatever
  // period the chart/breakdowns below are scoped to.
  useEffect(() => {
    api
      .get<SummaryStats>("/appeals/summary")
      .then(setSummary)
      .catch(() => {});
    api
      .get<PetConfig>("/pet/config")
      .then(setPetConfig)
      .catch(() => {});
    api
      .get<{ branches: Branch[] }>("/branches/mine")
      .then((res) => {
        const activeId = getActiveBranchId();
        const active = activeId
          ? res.branches.find((b) => b.id === activeId)
          : res.branches.length === 1
            ? res.branches[0]
            : null;
        if (active) setInnModuleEnabled(active.innEnabled);
      })
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

  const isNewUi = user?.uiVersion === "new";

  const periodTotal = byDate.reduce((sum, d) => sum + d.count, 0);
  const trendPct =
    prevPeriodTotal !== null && prevPeriodTotal > 0
      ? Math.round(((periodTotal - prevPeriodTotal) / prevPeriodTotal) * 100)
      : null;

  // Shared between the classic toolbar (old interface) and the chart card's
  // header (new interface, where it moves alongside the chart it drives) —
  // same controls, same state, just rendered in a different place.
  const periodControls = (
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
  );

  // New interface's variant of the same controls — pill buttons instead of
  // a <select>, styled to sit in the chart card's header (see the design
  // canvas this was modeled on). Same state, same period/day semantics.
  const periodControlsNew = (
    <div className="period-controls-new">
      <div className="period-pills">
        {(
          [
            ["today", "Сегодня"],
            ["week", "Неделя"],
            ["month", "Месяц"],
            ["custom", "Период"],
          ] as [Period, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`period-pill${period === value ? " period-pill-active" : ""}`}
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="period-controls-new-dates">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span>—</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
      <label className="period-controls-new-day">
        За день
        <input type="date" value={selectedDay} onChange={(e) => pickDay(e.target.value)} />
      </label>
    </div>
  );

  const pageBody = (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="page-title-row">
            <h1>Статистика</h1>
            <BranchSwitcher />
          </div>
        </div>
        {!isNewUi && (
          <div className="header-actions">
            <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
              <IconBack />
            </Link>
          </div>
        )}
      </header>

      {innModuleEnabled && (!isNewUi || activeTab === "inn") && (
        <div className="stats-tabs-row">
          <div className="stats-tabs-side">
            {activeTab === "inn" && (
              <label className="stats-tabs-period">
                Период
                <select value={innPeriod} onChange={(e) => setInnPeriod(e.target.value as "date" | "week" | "month")}>
                  <option value="date">На дату</option>
                  <option value="week">Неделя</option>
                  <option value="month">Месяц</option>
                </select>
              </label>
            )}
            {activeTab === "inn" && innPeriod === "date" && (
              <input
                type="date"
                className="stats-tabs-date"
                value={innStatsDate}
                onChange={(e) => setInnStatsDate(e.target.value)}
              />
            )}
          </div>
          {!isNewUi && (
            <div className="admin-tabs">
              <button
                className={`admin-tab${activeTab === "appeals" ? " admin-tab-active" : ""}`}
                onClick={() => setActiveTab("appeals")}
              >
                Обращения
              </button>
              <button
                className={`admin-tab${activeTab === "inn" ? " admin-tab-active" : ""}`}
                onClick={() => setActiveTab("inn")}
              >
                ИНН
              </button>
            </div>
          )}
          <div className="stats-tabs-side stats-tabs-side-end">
            {activeTab === "inn" && (
              <div className="stats-tabs-inn-search-wrap">
                <input
                  type="text"
                  className="stats-tabs-inn-search"
                  placeholder="Поиск по ИНН"
                  value={innSearch}
                  onChange={(e) => setInnSearch(e.target.value)}
                />
                {innSearch && (
                  <button
                    type="button"
                    className="stats-tabs-inn-search-clear"
                    onClick={() => setInnSearch("")}
                    title="Очистить поиск"
                    aria-label="Очистить поиск"
                  >
                    <IconX width={12} height={12} />
                  </button>
                )}
              </div>
            )}
            {activeTab === "inn" && isAdmin && (
              <button
                type="button"
                className={`admin-tab${innBulkEdit ? " admin-tab-active" : ""}`}
                onClick={() => setInnBulkEdit((v) => !v)}
              >
                Массовое редактирование
              </button>
            )}
          </div>
        </div>
      )}

      {isNewUi && (
        <QuickStatsTiles
          summary={summary}
          innModuleEnabled={innModuleEnabled}
          onOpenInnTab={() => setActiveTab("inn")}
        />
      )}

      {activeTab === "inn" ? (
        <InnStatsSection
          isAdmin={isAdmin}
          period={innPeriod}
          date={innStatsDate}
          bulkEdit={innBulkEdit}
          search={innSearch}
        />
      ) : (
        <>
      {!isNewUi && (
        <div className="stats-toolbar">
          {periodControls}
          <div className="stats-summary kpi-grid">
            <Kpi value={summary.today} label="трубок сегодня" accent="gold" />
            <Kpi value={summary.week} label="трубок на этой неделе" accent="gold" />
            <Kpi value={summary.total} label="трубок за всё время" accent="muted" />
          </div>
        </div>
      )}

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          {isNewUi ? (
            <div className="chart-card">
              <div className="chart-head">
                <div>
                  <h3>
                    Трубки по дням
                    {trendPct !== null && (
                      <span className={`chart-badge${trendPct < 0 ? " chart-badge-down" : ""}`}>
                        {trendPct >= 0 ? "▲" : "▼"} {Math.abs(trendPct)}% к прошлому периоду
                      </span>
                    )}
                  </h3>
                  <div className="chart-sub">
                    Итого за период: {periodTotal} · нажмите на столбец, чтобы посмотреть список
                  </div>
                </div>
                {periodControlsNew}
              </div>
              <DailyChart data={byDate} onPick={loadDay} enhanced />
            </div>
          ) : (
            <section className="stats-section">
              <p className="stats-eyebrow">Трубки</p>
              <h2>Трубки по дням — нажмите на столбец, чтобы посмотреть список</h2>
              <div className="table-scroll stats-chart-wrap">
                <DailyChart data={byDate} onPick={loadDay} />
              </div>
            </section>
          )}

          {selectedDay && (
            <section className="stats-section">
              <h2>Трубки за {formatDay(selectedDay)}</h2>
              {dayLoading ? <p>Загрузка...</p> : <DayAppealsTable appeals={dayAppeals} />}
            </section>
          )}

          <section className="stats-section">
            <div className="stats-panels">
              <div className="stats-panel">
                <OperatorBreakdown rows={byOperator} enhanced={isNewUi} />
              </div>
              <div className="stats-panel-column">
                <div className="stats-panel">
                  <SortableBreakdown
                    title="По Госам"
                    rows={byGov.map((g) => ({ label: g.value, count: g.count }))}
                    enhanced={isNewUi}
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
                  enhanced={isNewUi}
                />
              </div>
            </div>
          </section>

          {callStats && <CallStatsSection stats={callStats} />}
          {walletStats && <WalletStatsSection stats={walletStats} />}
        </>
      )}
        </>
      )}

      <footer className="stats-footer muted">
        Версия {APP_VERSION} (сборка {APP_BUILD}) · <Link to="/changelog">История версий и обновлений</Link>
      </footer>

      {activeTab === "appeals" && petConfig?.enabled && <PetStatsAssistant byOperator={byOperator} config={petConfig} />}
    </div>
  );

  return isNewUi ? <AppShell active="stats">{pageBody}</AppShell> : pageBody;
}
