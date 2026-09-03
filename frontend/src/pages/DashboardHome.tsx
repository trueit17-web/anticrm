import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { todayInputValue } from "../lib/dateUtils";
import { Appeal, OperatorStat } from "../types";
import { useAuth } from "../auth/AuthContext";
import { IconAdmin, IconDatabase, IconNotepadPencil, IconPhone, IconStats } from "../components/icons";

// Monday of the week containing isoDate — weeks here always run Пн–Сб
// (mirrors the same helper in AppealsPage.tsx's WeekLeaders).
function mondayOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

// Landing view for the "new" interface's Трубки section — a scenario-first
// summary (today's count, this week's standing, quick jumps) in front of the
// full working table, rather than dropping straight into the table like the
// classic layout does. See AppShell.tsx for the surrounding rail nav.
export function DashboardHome({
  appeals,
  onOpenTable,
  innModuleEnabled,
  contactsModuleEnabled,
}: {
  appeals: Appeal[];
  onOpenTable: () => void;
  innModuleEnabled: boolean;
  contactsModuleEnabled: boolean;
}) {
  const { user } = useAuth();
  const [weekStats, setWeekStats] = useState<{ total: number; rank: number | null; count: number } | null>(null);

  useEffect(() => {
    const monday = mondayOfWeek(todayInputValue());
    const to = new Date(`${monday}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 6);
    api
      .get<{ byOperator: OperatorStat[] }>(`/appeals/stats?from=${monday}&to=${to.toISOString().slice(0, 10)}`)
      .then((res) => {
        const total = res.byOperator.reduce((sum, o) => sum + o.count, 0);
        const idx = res.byOperator.findIndex((o) => o.operatorId === user?.id);
        setWeekStats({ total, rank: idx >= 0 ? idx + 1 : null, count: idx >= 0 ? res.byOperator[idx].count : 0 });
      })
      .catch(() => setWeekStats(null));
  }, [user?.id]);

  const todayCount = appeals.length;
  const inWork = appeals.filter((a) => a.status !== "Отказ" && a.status !== "Согласие").length;

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi kpi--gold">
          <div className="kpi-label">Трубки сегодня</div>
          <div className="kpi-value">{todayCount}</div>
          <div className="kpi-sub">{inWork} в работе</div>
          <button type="button" className="kpi-link-btn" onClick={onOpenTable}>
            Открыть таблицу →
          </button>
        </div>
        <div className="kpi kpi--info">
          <div className="kpi-label">Место в рейтинге</div>
          <div className="kpi-value">{weekStats?.rank ? `#${weekStats.rank}` : "—"}</div>
          <div className="kpi-sub">{weekStats ? `${weekStats.count} трубок за неделю` : "загрузка…"}</div>
        </div>
        <div className="kpi kpi--success">
          <div className="kpi-label">Статистика недели</div>
          <div className="kpi-value">{weekStats?.total ?? "—"}</div>
          <div className="kpi-sub">трубок по филиалу, Пн–Сб</div>
          <Link className="kpi-link-btn" to="/stats">
            Подробнее →
          </Link>
        </div>
        {innModuleEnabled && (
          <div className="kpi kpi--danger">
            <div className="kpi-label">ИНН</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>
              Журнал дня
            </div>
            <div className="kpi-sub">фиксация организаций, с которыми связались</div>
            <button
              type="button"
              className="kpi-link-btn"
              onClick={() => document.querySelector<HTMLButtonElement>(".inn-dock-icon")?.click()}
            >
              Открыть ИНН →
            </button>
          </div>
        )}
      </div>

      <div className="lower-panels">
        <div className="table-scroll">
          <table className="appeals-table table-auto">
            <thead>
              <tr>
                <th>Оператор</th>
                <th>Клиент</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {appeals.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty-state">
                    Трубок пока нет.
                  </td>
                </tr>
              )}
              {appeals.slice(0, 6).map((a) => (
                <tr key={a.id}>
                  <td>{a.operator.fullName}</td>
                  <td className="wrap-cell" title={a.clientData ?? undefined}>
                    {a.clientData || "—"}
                  </td>
                  <td>
                    <span className="status-pill">{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {appeals.length > 6 && (
            <button type="button" className="kpi-link-btn" style={{ margin: "8px 12px" }} onClick={onOpenTable}>
              Показать все →
            </button>
          )}
        </div>

        {(contactsModuleEnabled || user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
          <div className="quick-links-card">
            <h3>Быстрые переходы</h3>
            {contactsModuleEnabled && (user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
              <Link to="/contacts" className="quick-link-pill">
                {user?.role === "MANAGER" ? <IconPhone width={16} height={16} /> : <IconDatabase width={16} height={16} />}
                {user?.role === "MANAGER" ? "Прозвон" : "Базы"}
              </Link>
            )}
            <Link to="/stats" className="quick-link-pill">
              <IconStats width={16} height={16} />
              Статистика
            </Link>
            {(user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
              <Link to="/admin" className="quick-link-pill">
                <IconAdmin width={16} height={16} />
                Админка
              </Link>
            )}
            {innModuleEnabled && (
              <button
                type="button"
                className="quick-link-pill"
                onClick={() => document.querySelector<HTMLButtonElement>(".inn-dock-icon")?.click()}
              >
                <IconNotepadPencil width={16} height={16} />
                ИНН
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
