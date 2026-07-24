import { useState } from "react";
import { api, ApiError } from "../api/client";
import { APP_VERSION } from "../data/changelog";
import { IconCheck } from "./icons";

// True if version `a` ("1.17.0") is strictly newer than `b`.
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Run on the server, in the project directory, to pull the latest code and
// rebuild the containers. Shown (not executed) — updating prod is a manual,
// deliberate step.
const DEPLOY_COMMAND = "git pull && docker compose -f docker-compose.prod.yml up -d --build";

export function UpdatesManager() {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCheck() {
    setChecking(true);
    setError(null);
    setChecked(false);
    try {
      const res = await api.get<{ latestVersion: string | null }>("/system/update-check");
      setLatest(res.latestVersion);
      setChecked(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось проверить обновления");
    } finally {
      setChecking(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(DEPLOY_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked (non-HTTPS/permissions) — the command is
      // still visible on screen for manual copy.
    }
  }

  const updateAvailable = checked && latest !== null && isNewer(latest, APP_VERSION);

  return (
    <section className="admin-field-card fit-content">
      <h2>Обновления</h2>
      <p className="muted">Текущая версия: {APP_VERSION}</p>
      <p className="muted">
        Проверяет наличие новой версии на GitHub. Если она есть — покажет команду, которую нужно
        выполнить на сервере, чтобы обновиться.
      </p>

      <div className="inline-form">
        <button type="button" onClick={handleCheck} disabled={checking}>
          {checking ? "Проверка..." : "Проверить обновления"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {checked && !error && !updateAvailable && (
        <p className="update-uptodate">
          <IconCheck width={16} height={16} /> У вас последняя версия{latest ? ` (${latest})` : ""}.
        </p>
      )}

      {updateAvailable && (
        <div className="update-available">
          <p>
            Доступно обновление: <strong>{latest}</strong> (у вас {APP_VERSION}).
          </p>
          <p className="muted">Выполните на сервере в каталоге проекта, чтобы обновить прод:</p>
          <pre className="update-command">{DEPLOY_COMMAND}</pre>
          <button type="button" className="btn-save" onClick={handleCopy}>
            <IconCheck width={15} height={15} />
            {copied ? "Скопировано" : "Скопировать команду"}
          </button>
        </div>
      )}
    </section>
  );
}
