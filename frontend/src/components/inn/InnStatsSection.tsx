import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { InnStatsMine, InnStatsSummary } from "../../types";

function Kpi({ value, label }: { value: number; label: string }) {
  return (
    <div className="kpi kpi--gold">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

// USER sees only their own ИНН log totals; ADMIN/SUPERADMIN see the summary
// for the branch currently picked in BranchSwitcher ("отдел" in this
// project has no separate entity — it is the selected branch), broken down
// by operator.
export function InnStatsSection({ isAdmin, from, to }: { isAdmin: boolean; from: string; to: string }) {
  const [mine, setMine] = useState<InnStatsMine | null>(null);
  const [summary, setSummary] = useState<InnStatsSummary | null>(null);

  useEffect(() => {
    if (isAdmin) {
      api
        .get<InnStatsSummary>(`/inn/stats/summary?from=${from}&to=${to}`)
        .then(setSummary)
        .catch(() => setSummary(null));
    } else {
      api
        .get<InnStatsMine>(`/inn/stats/mine?from=${from}&to=${to}`)
        .then(setMine)
        .catch(() => setMine(null));
    }
  }, [isAdmin, from, to]);

  if (isAdmin) {
    return (
      <section className="stats-section">
        <p className="stats-eyebrow">ИНН — сводка по филиалу</p>
        <div className="kpi-grid">
          <Kpi value={summary?.totalEntries ?? 0} label="записей ИНН" />
          <Kpi value={summary?.totalContacts ?? 0} label="контактов" />
          <Kpi value={summary?.totalTransferred ?? 0} label="передано" />
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
                </tr>
              </thead>
              <tbody>
                {summary.byOperator.map((row) => (
                  <tr key={row.operatorId}>
                    <td>{row.operatorName}</td>
                    <td className="col-num">{row.entries}</td>
                    <td className="col-num">{row.contacts}</td>
                    <td className="col-num">{row.transferred}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">За выбранный период записей ИНН нет.</p>
        )}
      </section>
    );
  }

  return (
    <section className="stats-section">
      <p className="stats-eyebrow">ИНН — моя статистика</p>
      <div className="kpi-grid">
        <Kpi value={mine?.totalEntries ?? 0} label="записей ИНН" />
        <Kpi value={mine?.totalContacts ?? 0} label="контактов" />
        <Kpi value={mine?.totalTransferred ?? 0} label="передано" />
      </div>
    </section>
  );
}
