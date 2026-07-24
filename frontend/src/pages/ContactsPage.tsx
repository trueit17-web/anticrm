import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError, getActiveBranchId } from "../api/client";
import { Branch, Contact, ContactBatch, SocialFundOffice } from "../types";
import { parseExtraInfo } from "../lib/contactExtraInfo";
import { BranchSwitcher } from "../components/BranchSwitcher";
import { IconBack, IconCheck, IconTrash, IconX } from "../components/icons";
import { EmployeeNameButton } from "../components/EmployeeCard";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

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
      const res = await api.upload<{
        batch: ContactBatch | null;
        summary: { parsed: number; added: number; duplicatesInFile: number; alreadyInBranch: number };
      }>("/contacts/upload", formData);
      const s = res.summary;
      let msg = `Добавлено ${s.added} из ${s.parsed} номеров.`;
      const skipped: string[] = [];
      if (s.duplicatesInFile > 0) skipped.push(`дубликатов в файле — ${s.duplicatesInFile}`);
      if (s.alreadyInBranch > 0) skipped.push(`уже в базе — ${s.alreadyInBranch}`);
      if (skipped.length > 0) msg += ` Пропущено: ${skipped.join(", ")}.`;
      setResult(msg);
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
        CSV, Excel (.xlsx) или текстовый файл (.txt). В CSV/Excel первая колонка — телефон, вторая
        — имя (необязательно), заголовки «Телефон»/«Имя» распознаются автоматически. В TXT —
        построчно «Метка: значение»: «Имя:», «Дата рождения:», «Основной номер:», «Номер
        телефона:» (доп. номера), остальные строки идут в доп. инфу; контакты разделяются строкой
        «-----». Номера приводятся к единому виду (+7…); повторы внутри файла и номера, уже
        имеющиеся в базе филиала, повторно не добавляются.
      </p>
      <form className="inline-form" onSubmit={handleUpload}>
        <input type="file" accept=".csv,.xlsx,.txt" onChange={handleFileChange} />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? "Загрузка..." : "Загрузить"}
        </button>
      </form>
      {result && <p className="muted">{result}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Uploaded bases
// ---------------------------------------------------------------------------

function BatchesSection({ batches, loading, error, onDeleted }: {
  batches: ContactBatch[];
  loading: boolean;
  error: string | null;
  onDeleted: () => void;
}) {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(id: number) {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.delete(`/contacts/batches/${id}`);
      setConfirmingId(null);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Не удалось удалить базу");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="admin-field-card fit-content">
      <h2>Загруженные базы{batches.length > 0 ? ` (${batches.length})` : ""}</h2>
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && batches.length === 0 && <p className="muted">Баз пока нет.</p>}
      {!loading && !error && batches.length > 0 && (
        <div className="batches-scroll">
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
                      в очереди: {remaining}, в работе: {inProgress}, передал: {reached}, недозвон:{" "}
                      {notReached}, отказ: {declined}, перезвонить: {callback}
                    </span>
                    {confirmingId === b.id && deleteError && <p className="error-text">{deleteError}</p>}
                  </span>
                  {confirmingId === b.id ? (
                    <span className="admin-option-actions">
                      <span className="muted">Удалить базу «{b.fileName}» ({b.totalCount} шт.)?</span>
                      <button className="secondary" disabled={deleting} onClick={() => handleDelete(b.id)}>
                        {deleting ? "Удаление..." : "Да, удалить"}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          setConfirmingId(null);
                          setDeleteError(null);
                        }}
                      >
                        Отмена
                      </button>
                    </span>
                  ) : (
                    <button
                      className="delete-x"
                      title="Удалить базу"
                      aria-label="Удалить базу"
                      onClick={() => setConfirmingId(b.id)}
                    >
                      <IconTrash width={13} height={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// СФР offices — summary card + editor modal
// ---------------------------------------------------------------------------

function SfrRow({ office, onChanged }: { office: SocialFundOffice; onChanged: () => void }) {
  const [city, setCity] = useState(office.city);
  const [address, setAddress] = useState(office.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = city !== office.city || address !== office.address;

  async function save() {
    if (!city.trim() || !address.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/contacts/social-fund-offices/${office.id}`, { city: city.trim(), address: address.trim() });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/contacts/social-fund-offices/${office.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <input value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
      </td>
      <td>
        <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
      </td>
      <td className="sfr-row-actions">
        <button className="btn-save" onClick={save} disabled={busy || !dirty} title="Сохранить" aria-label="Сохранить">
          <IconCheck width={14} height={14} />
        </button>
        {confirmDel ? (
          <>
            <button className="secondary" onClick={del} disabled={busy}>
              Да
            </button>
            <button className="secondary" onClick={() => setConfirmDel(false)} disabled={busy}>
              Нет
            </button>
          </>
        ) : (
          <button className="delete-x" onClick={() => setConfirmDel(true)} title="Удалить" aria-label="Удалить">
            <IconTrash width={13} height={13} />
          </button>
        )}
        {error && <span className="error-text">{error}</span>}
      </td>
    </tr>
  );
}

function SfrEditorModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [search, setSearch] = useState("");
  const [offices, setOffices] = useState<SocialFundOffice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCity, setNewCity] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback((q: string) => {
    setLoading(true);
    setError(null);
    api
      .get<{ offices: SocialFundOffice[]; hasMore: boolean }>(
        `/contacts/social-fund-offices/search?search=${encodeURIComponent(q)}`
      )
      .then((r) => {
        setOffices(r.offices);
        setHasMore(r.hasMore);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }, []);

  // Debounced search — a keystroke waits 300 ms before hitting the server.
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  function refresh() {
    load(search);
    onChanged();
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newCity.trim() || !newAddress.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.post("/contacts/social-fund-offices", { city: newCity.trim(), address: newAddress.trim() });
      setNewCity("");
      setNewAddress("");
      refresh();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Не удалось добавить");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide call-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="call-card-close" onClick={onClose} aria-label="Закрыть">
          <IconX width={18} height={18} />
        </button>
        <h2>Адреса СФР по городам</h2>
        <p className="muted">
          Город → адрес местного соц. фонда для карточки звонка. Почтовый индекс в адресе не нужен —
          он убирается автоматически.
        </p>

        <form className="inline-form" onSubmit={handleAdd}>
          <input placeholder="Город" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          <input placeholder="Адрес СФР" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          <button type="submit" className="btn-save" disabled={adding}>
            <IconCheck width={15} height={15} />
            {adding ? "..." : "Добавить"}
          </button>
        </form>
        {addError && <p className="error-text">{addError}</p>}

        <input
          className="sfr-search"
          placeholder="Поиск по городу или адресу…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading && <p className="muted">Загрузка…</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && offices.length === 0 && <p className="empty-state">Ничего не найдено.</p>}
        {!loading && !error && offices.length > 0 && (
          <div className="table-scroll sfr-table-scroll">
            <table className="appeals-table table-auto">
              <thead>
                <tr>
                  <th>Город</th>
                  <th>Адрес</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => (
                  <SfrRow key={o.id} office={o} onChanged={refresh} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <p className="muted">Показаны первые 100 — уточните поиск, чтобы найти остальные.</p>
        )}
      </div>
    </div>
  );
}

function SocialFundOfficesSection({ count, loading, error, onChanged }: {
  count: number | null;
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await api.download("/contacts/social-fund-offices/export", "sfr_offices.csv");
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "Не удалось скачать");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="admin-field-card fit-content">
      <h2>Города — адреса СФР</h2>
      <p className="muted">
        Используется в карточке звонка: по городу из поля «Адрес» клиента подставляется адрес
        местного соц. фонда.
      </p>
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <p className="muted">Всего в справочнике: {count ?? 0}.</p>}
      <div className="inline-form">
        <button type="button" onClick={() => setEditing(true)}>
          Редактировать таблицу
        </button>
        <button type="button" className="secondary" onClick={handleDownload} disabled={downloading}>
          {downloading ? "Скачивание..." : "Скачать CSV"}
        </button>
      </div>
      {downloadError && <p className="error-text">{downloadError}</p>}
      {editing && <SfrEditorModal onClose={() => setEditing(false)} onChanged={onChanged} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Queue — grouped by organization ИНН, collapsible, sorted by deposit
// ---------------------------------------------------------------------------

const QUEUE_CAP = 3000;

interface QueueRow {
  contact: Contact;
  dep: number | null;
  depRaw: string | null;
}
interface InnGroup {
  key: string;
  inn: string | null;
  rows: QueueRow[];
  depSum: number;
}

function parseDeposit(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Group the whole queue by organization ИНН, biggest deposits first inside
// each group, groups ordered by ИНН (contacts without one sink to a "Без ИНН"
// group at the end).
function buildInnGroups(queue: Contact[]): InnGroup[] {
  const map = new Map<string, InnGroup>();
  for (const c of queue) {
    const info = parseExtraInfo(c.extraInfo);
    const dep = parseDeposit(info.depositTotal);
    const key = info.inn ?? "__none__";
    let g = map.get(key);
    if (!g) {
      g = { key, inn: info.inn, rows: [], depSum: 0 };
      map.set(key, g);
    }
    g.rows.push({ contact: c, dep, depRaw: info.depositTotal });
    if (dep !== null) g.depSum += dep;
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.rows.sort((a, b) => (b.dep ?? -Infinity) - (a.dep ?? -Infinity));
  }
  groups.sort((a, b) => {
    if (a.inn === null) return 1;
    if (b.inn === null) return -1;
    return a.inn.localeCompare(b.inn, undefined, { numeric: true });
  });
  return groups;
}

function formatDep(dep: number | null, raw: string | null): string {
  if (dep !== null) return dep.toLocaleString("ru-RU");
  return raw || "—";
}

function QueueSection({ queue, loading, error, onClaimed }: {
  queue: Contact[];
  loading: boolean;
  error: string | null;
  onClaimed: () => void;
}) {
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => buildInnGroups(queue), [queue]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
      <div className="queue-head">
        <h2>Очередь</h2>
        {!loading && !error && queue.length > 0 && (
          <span className="muted">
            {queue.length} контактов · {groups.length} орг.
            {queue.length >= QUEUE_CAP ? ` (показаны первые ${QUEUE_CAP})` : ""}
          </span>
        )}
      </div>
      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {claimError && <p className="error-text">{claimError}</p>}
      {!loading && !error && queue.length === 0 && <p className="empty-state">Очередь пуста.</p>}
      {!loading && !error && groups.length > 0 && (
        <div className="inn-groups">
          {groups.map((g) => {
            const isOpen = expanded.has(g.key);
            return (
              <div className={`inn-group${isOpen ? " open" : ""}`} key={g.key}>
                <button type="button" className="inn-group-head" onClick={() => toggle(g.key)}>
                  <span className="inn-caret">{isOpen ? "▾" : "▸"}</span>
                  <span className="inn-label">{g.inn ? `ИНН ${g.inn}` : "Без ИНН"}</span>
                  <span className="inn-meta muted">
                    {g.rows.length} чел.
                    {g.depSum > 0 ? ` · деп. ${g.depSum.toLocaleString("ru-RU")}` : ""}
                  </span>
                </button>
                {isOpen && (
                  <div className="table-scroll">
                    <table className="appeals-table table-auto contacts-table">
                      <thead>
                        <tr>
                          <th>Телефон</th>
                          <th>Имя</th>
                          <th className="col-num">Деп.</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map(({ contact: c, dep, depRaw }) => (
                          <tr key={c.id}>
                            <td>{c.phone}</td>
                            <td>{c.fullName || "—"}</td>
                            <td className="col-num">{formatDep(dep, depRaw)}</td>
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ContactsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
  const isManager = user?.role === "MANAGER";
  const canUpload = isAdmin || isManager;

  // Defaults to enabled so the page doesn't flash a "disabled" message while
  // /branches/mine is still loading — the backend enforces the flag anyway.
  const [moduleEnabled, setModuleEnabled] = useState(true);

  const [batches, setBatches] = useState<ContactBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(isAdmin);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [queue, setQueue] = useState<Contact[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [officesCount, setOfficesCount] = useState<number | null>(null);
  const [officesLoading, setOfficesLoading] = useState(isAdmin);
  const [officesError, setOfficesError] = useState<string | null>(null);

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

  function loadOffices() {
    if (!isAdmin) return;
    setOfficesLoading(true);
    setOfficesError(null);
    api
      .get<{ count: number }>("/contacts/social-fund-offices/count")
      .then((res) => setOfficesCount(res.count))
      .catch((err) => setOfficesError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setOfficesLoading(false));
  }

  useEffect(() => {
    loadBatches();
    loadQueue();
    loadOffices();
    api
      .get<{ branches: Branch[] }>("/branches/mine")
      .then((res) => {
        const activeId = getActiveBranchId();
        const active = activeId
          ? res.branches.find((b) => b.id === activeId)
          : res.branches.length === 1
            ? res.branches[0]
            : null;
        if (active) setModuleEnabled(active.contactsEnabled);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClaimedOrChanged() {
    loadQueue();
    if (isAdmin) loadBatches();
  }

  if (!user) return null;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="page-title-row">
            <h1>Прозвон</h1>
            <BranchSwitcher />
          </div>
          <p className="muted">Загруженные базы клиентов и очередь на обзвон.</p>
        </div>
        <div className="header-actions">
          <Link to="/" className="icon-link" title="К трубкам" aria-label="К трубкам">
            <IconBack />
          </Link>
        </div>
      </header>

      {!moduleEnabled ? (
        <p className="empty-state">
          Модуль «Прозвон» отключён для этого филиала — обратитесь к суперадминистратору.
        </p>
      ) : (
        <>
          {(canUpload || isAdmin) && (
            <div className="contacts-top-row">
              {canUpload && <UploadSection onUploaded={handleClaimedOrChanged} />}
              {isAdmin && (
                <SocialFundOfficesSection
                  count={officesCount}
                  loading={officesLoading}
                  error={officesError}
                  onChanged={loadOffices}
                />
              )}
            </div>
          )}

          {isAdmin ? (
            <div className="contacts-main">
              <div className="contacts-col-bases">
                <BatchesSection
                  batches={batches}
                  loading={batchesLoading}
                  error={batchesError}
                  onDeleted={handleClaimedOrChanged}
                />
              </div>
              <div className="contacts-col-queue">
                <QueueSection queue={queue} loading={queueLoading} error={queueError} onClaimed={handleClaimedOrChanged} />
              </div>
            </div>
          ) : (
            <QueueSection queue={queue} loading={queueLoading} error={queueError} onClaimed={handleClaimedOrChanged} />
          )}
        </>
      )}
    </div>
  );
}
