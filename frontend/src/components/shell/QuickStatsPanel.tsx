import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { todayInputValue } from "../../lib/dateUtils";
import { OperatorStat, SummaryStats } from "../../types";
import { useAuth } from "../../auth/AuthContext";
import { IconAdmin, IconDatabase, IconNotepadPencil, IconPhone } from "../icons";

// Monday of the week containing isoDate — weeks here always run Пн–Сб
// (mirrors AppealsPage.tsx's WeekLeaders). Deliberately independent of
// whatever period Статистика's own selector is set to — this tile always
// reflects the current calendar week's standing.
function mondayOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

// Scenario-first tiles for the "new" interface — shown at the top of
// Статистика (see StatsPage.tsx), which is where they landed after moving
// off the Трубки page's landing screen. Реuses the already-loaded summary
// counts from the page; only the weekly leaderboard rank is fetched here.
export function QuickStatsTiles({ summary, innModuleEnabled }: { summary: SummaryStats; innModuleEnabled: boolean }) {
  const { user } = useAuth();
  const [rank, setRank] = useState<{ place: number | null; count: number } | null>(null);

  useEffect(() => {
    const monday = mondayOfWeek(todayInputValue());
    const to = new Date(`${monday}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 6);
    api
      .get<{ byOperator: OperatorStat[] }>(`/appeals/stats?from=${monday}&to=${to.toISOString().slice(0, 10)}`)
      .then((res) => {
        const idx = res.byOperator.findIndex((o) => o.operatorId === user?.id);
        setRank({ place: idx >= 0 ? idx + 1 : null, count: idx >= 0 ? res.byOperator[idx].count : 0 });
      })
      .catch(() => setRank(null));
  }, [user?.id]);

  return (
    <div className="kpi-grid" style={{ marginBottom: 16 }}>
      <div className="kpi kpi--gold">
        <div className="kpi-label">Трубки сегодня</div>
        <div className="kpi-value">{summary.today}</div>
        <Link className="kpi-link-btn" to="/">
          Открыть таблицу →
        </Link>
      </div>
      <div className="kpi kpi--info">
        <div className="kpi-label">Место в рейтинге</div>
        <div className="kpi-value">{rank?.place ? `#${rank.place}` : "—"}</div>
        <div className="kpi-sub">{rank ? `${rank.count} трубок за неделю` : "загрузка…"}</div>
      </div>
      <div className="kpi kpi--success">
        <div className="kpi-label">Статистика недели</div>
        <div className="kpi-value">{summary.week}</div>
        <div className="kpi-sub">трубок на этой неделе</div>
      </div>
      {innModuleEnabled && (
        <div className="kpi kpi--danger">
          <div className="kpi-label">ИНН</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>
            Журнал дня
          </div>
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
  );
}

export function QuickLinksPanel({
  innModuleEnabled,
  contactsModuleEnabled,
}: {
  innModuleEnabled: boolean;
  contactsModuleEnabled: boolean;
}) {
  const { user } = useAuth();
  if (!user) return null;

  const showContacts =
    contactsModuleEnabled && (user.role === "MANAGER" || user.role === "ADMIN" || user.role === "SUPERADMIN");
  const showAdmin = user.role === "ADMIN" || user.role === "SUPERADMIN";
  if (!showContacts && !showAdmin && !innModuleEnabled) return null;

  return (
    <div className="quick-links-card quick-links-card--row" style={{ marginBottom: 16 }}>
      <h3>Быстрые переходы</h3>
      {showContacts && (
        <Link to="/contacts" className="quick-link-pill">
          {user.role === "MANAGER" ? <IconPhone width={16} height={16} /> : <IconDatabase width={16} height={16} />}
          {user.role === "MANAGER" ? "Прозвон" : "Базы"}
        </Link>
      )}
      {showAdmin && (
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
  );
}
