import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import { CONTACT_STATUS_LABELS, Contact, ContactBatch, ContactStatus } from "../types";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconBack, IconTrash } from "../components/icons";
import { EmployeeNameButton } from "../components/EmployeeCard";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const OUTCOME_STATUSES: { status: ContactStatus; label: string }[] = [
  { status: "NOT_REACHED", label: CONTACT_STATUS_LABELS.NOT_REACHED },
  { status: "DECLINED", label: CONTACT_STATUS_LABELS.DECLINED },
  { status: "CALLBACK", label: CONTACT_STATUS_LABELS.CALLBACK },
];

function UploadSection({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.upload<{ batch: ContactBatch }>("/contacts/upload", formData);
      setResult(`Загружено ${res.batch.totalCount} контактов из файла «${res.batch.fileName}»`);
      setFile(null);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="admin-field-card fit-content">
      <h2>Загрузить базу</h2>
      <p className="muted">
        CSV или Excel (.xlsx). Первая колонка — телефон, вторая — имя (необязательно). Заголовки
        «Телефон»/«Имя» распознаются автоматически.
      </p>
      <form className="inline-form" onSubmit={handleUpload}>
        <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? "Загрузка..." : "Загрузить"}
        </button>
      </form>
      {result && <p className="muted">{result}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function BatchesSection({ batches, loading, error, onDeleted }: {
  batches: ContactBatch[];
  loading: boolean;
  error: string | null;
  onDeleted: () => void;
}) {
  async function handleDelete(id: number) {
    try {
      await api.delete(`/contacts/batches/${id}`);
    } finally {
      onDeleted();
    }
  }

  return (
    <section className="admin-field-card fit-content">
      <h2>Загруженные базы</h2>
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && batches.length === 0 && <p className="muted">Баз пока нет.</p>}
      {!loading && !error && batches.length > 0 && (
        <ul className="admin-option-list">
          {batches.map((b) => {
            const c = b.counts;
            const reached = c.REACHED ?? 0;
            const notReached = c.NOT_REACHED ?? 0;
            const declined = c.DECLINED ?? 0;
            const callback = c.CALLBACK ?? 0;
            const inProgress = c.IN_PROGRESS ?? 0;
            const remaining = c.NEW ?? 0;
            return (
              <li key={b.id}>
                <span>
                  {b.fileName} — {b.totalCount} шт., {formatDateTime(b.createdAt)},{" "}
                  <EmployeeNameButton id={b.uploadedBy.id} fullName={b.uploadedBy.fullName} />
                  <br />
                  <span className="muted">
                    в очереди: {remaining}, в работе: {inProgress}, дозвон: {reached}, недозвон:{" "}
                    {notReached}, отказ: {declined}, перезвонить: {callback}
                  </span>
                </span>
                <button
                  className="delete-x"
                  title="Удалить базу"
                  aria-label="Удалить базу"
                  onClick={() => handleDelete(b.id)}
                >
                  <IconTrash width={13} height={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function QueueSection({ queue, loading, error, onClaimed }: {
  queue: Contact[];
  loading: boolean;
  error: string | null;
  onClaimed: () => void;
}) {
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  async function handleClaim(id: number) {
    setClaimingId(id);
    setClaimError(null);
    try {
      await api.post(`/contacts/${id}/claim`);
      onClaimed();
    } catch (err) {
      setClaimError(err instanceof ApiError ? err.message : "Не удалось взять контакт");
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <section className="stats-section">
      <h2>Очередь</h2>
      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {claimError && <p className="error-text">{claimError}</p>}
      {!loading && !error && queue.length === 0 && <p className="empty-state">Очередь пуста.</p>}
      {!loading && !error && queue.length > 0 && (
        <div className="table-scroll">
          <table className="appeals-table table-auto">
            <thead>
              <tr>
                <th>Телефон</th>
                <th>Имя</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((c) => (
                <tr key={c.id}>
                  <td>{c.phone}</td>
                  <td>{c.fullName || "—"}</td>
                  <td>
                    <button onClick={() => handleClaim(c.id)} disabled={claimingId === c.id}>
                      {claimingId === c.id ? "..." : "Взять в работу"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MineRow({ contact, onChanged }: { contact: Contact; onChanged: () => void }) {
  const [note, setNote] = useState(contact.resultNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOutcome(status: ContactStatus) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/contacts/${contact.id}/outcome`, { status, resultNote: note || null });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить результат");
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/contacts/${contact.id}/convert`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать трубку");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{contact.phone}</td>
      <td>{contact.fullName || "—"}</td>
      <td>
        <input
          placeholder="Заметка"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      </td>
      <td className="contact-actions">
        <button onClick={handleConvert} disabled={busy}>
          Дозвон
        </button>
        {OUTCOME_STATUSES.map((o) => (
          <button
            key={o.status}
            className="secondary"
            onClick={() => handleOutcome(o.status)}
            disabled={busy}
          >
            {o.label}
          </button>
        ))}
        {error && <span className="error-text">{error}</span>}
      </td>
    </tr>
  );
}

function MineSection({ mine, loading, error, onChanged }: {
  mine: Contact[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  return (
    <section className="stats-section">
      <h2>Мои контакты</h2>
      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && mine.length === 0 && (
        <p className="empty-state">У вас нет контактов в работе — возьмите из очереди выше.</p>
      )}
      {!loading && !error && mine.length > 0 && (
        <div className="table-scroll">
          <table className="appeals-table table-auto">
            <thead>
              <tr>
                <th>Телефон</th>
                <th>Имя</th>
                <th>Заметка</th>
                <th>Результат</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((c) => (
                <MineRow key={c.id} contact={c} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ContactsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";

  const [batches, setBatches] = useState<ContactBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(isAdmin);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [queue, setQueue] = useState<Contact[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [mine, setMine] = useState<Contact[]>([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineError, setMineError] = useState<string | null>(null);

  function loadBatches() {
    if (!isAdmin) return;
    setBatchesLoading(true);
    setBatchesError(null);
    api
      .get<{ batches: ContactBatch[] }>("/contacts/batches")
      .then((res) => setBatches(res.batches))
      .catch((err) => setBatchesError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setBatchesLoading(false));
  }

  function loadQueue() {
    setQueueLoading(true);
    setQueueError(null);
    api
      .get<{ contacts: Contact[] }>("/contacts/queue")
      .then((res) => setQueue(res.contacts))
      .catch((err) => setQueueError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setQueueLoading(false));
  }

  function loadMine() {
    setMineLoading(true);
    setMineError(null);
    api
      .get<{ contacts: Contact[] }>("/contacts/mine")
      .then((res) => setMine(res.contacts))
      .catch((err) => setMineError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setMineLoading(false));
  }

  useEffect(() => {
    loadBatches();
    loadQueue();
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClaimedOrChanged() {
    loadQueue();
    loadMine();
    if (isAdmin) loadBatches();
  }

  if (!user) return null;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Прозвон</h1>
          <p className="muted">Загруженная база клиентов и очередь на обзвон.</p>
        </div>
        <div className="header-actions">
          <BranchSwitcher />
          <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
            <IconBack />
          </Link>
        </div>
      </header>

      {isAdmin && (
        <div className="admin-fields-grid">
          <UploadSection onUploaded={loadBatches} />
          <BatchesSection
            batches={batches}
            loading={batchesLoading}
            error={batchesError}
            onDeleted={handleClaimedOrChanged}
          />
        </div>
      )}

      <QueueSection queue={queue} loading={queueLoading} error={queueError} onClaimed={handleClaimedOrChanged} />
      <MineSection mine={mine} loading={mineLoading} error={mineError} onChanged={handleClaimedOrChanged} />
    </div>
  );
}
