import { Link } from "react-router-dom";
import { CHANGELOG } from "../data/changelog";
import { formatRuDate } from "../lib/dateUtils";
import { IconBack } from "../components/icons";

export function ChangelogPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>История версий</h1>
        </div>
        <div className="header-actions">
          <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
            <IconBack />
          </Link>
        </div>
      </header>

      <div className="changelog-list">
        {CHANGELOG.map((entry) => (
          <section key={entry.version} className="admin-field-card">
            <h2>
              v{entry.version} <span className="muted">— {formatRuDate(entry.date)}</span>
            </h2>
            <ul className="changelog-changes">
              {entry.changes.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
