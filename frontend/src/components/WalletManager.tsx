import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { WalletRecipient } from "../types";
import { IconCheck, IconTrash } from "./icons";

interface WalletSource {
  id: number;
  address: string;
}

interface WalletConfig {
  sources: WalletSource[];
  enabled: boolean;
  hasTronscanApiKey: boolean;
  recipients: WalletRecipient[];
}

function RecipientRow({ recipient, onChanged }: { recipient: WalletRecipient; onChanged: () => void }) {
  const [address, setAddress] = useState(recipient.address);
  const [name, setName] = useState(recipient.name);
  const [isHub, setIsHub] = useState(recipient.isHub);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = address !== recipient.address || name !== recipient.name || isHub !== recipient.isHub;

  async function save() {
    if (!address.trim() || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/wallet/recipients/${recipient.id}`, { address: address.trim(), name: name.trim(), isHub });
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
      await api.delete(`/wallet/recipients/${recipient.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
      </td>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </td>
      <td className="col-center">
        <input type="checkbox" checked={isHub} onChange={(e) => setIsHub(e.target.checked)} disabled={busy} />
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

export function WalletManager() {
  const [config, setConfig] = useState<WalletConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSource, setNewSource] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);

  const [newAddress, setNewAddress] = useState("");
  const [newName, setNewName] = useState("");
  const [newIsHub, setNewIsHub] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<WalletConfig>("/wallet/config")
      .then((res) => setConfig(res))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAddSource(e: FormEvent) {
    e.preventDefault();
    if (!newSource.trim()) return;
    setAddingSource(true);
    setSourceError(null);
    try {
      await api.post("/wallet/sources", { address: newSource.trim() });
      setNewSource("");
      load();
    } catch (err) {
      setSourceError(err instanceof ApiError ? err.message : "Не удалось добавить");
    } finally {
      setAddingSource(false);
    }
  }

  async function deleteSource(id: number) {
    setSourceError(null);
    try {
      await api.delete(`/wallet/sources/${id}`);
      load();
    } catch (err) {
      setSourceError(err instanceof ApiError ? err.message : "Не удалось удалить");
    }
  }

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    if (!clearApiKey && !apiKey.trim()) return;
    setSavingKey(true);
    setKeyError(null);
    setKeySaved(false);
    try {
      await api.patch("/wallet/config", { tronscanApiKey: clearApiKey ? null : apiKey.trim() });
      setApiKey("");
      setClearApiKey(false);
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
      load();
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newAddress.trim() || !newName.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.post("/wallet/recipients", { address: newAddress.trim(), name: newName.trim(), isHub: newIsHub });
      setNewAddress("");
      setNewName("");
      setNewIsHub(false);
      load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Не удалось добавить");
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <p className="muted">Загрузка...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="admin-fields-grid">
      <section className="admin-field-card fit-content">
        <h2>Кошельки для подсчёта</h2>
        <p className="muted">
          Один или несколько TRON-адресов (T…). Исходящие переводы USDT (TRC-20) всех этих кошельков
          считаются вместе и показываются в статистике, сгруппированные по получателям.
        </p>
        {config && !config.enabled && (
          <p className="muted">
            Модуль «Считать кош» выключен для этого филиала — включите его на вкладке «Филиалы»
            (суперадмин), чтобы блок появился в статистике.
          </p>
        )}
        <form className="inline-form" onSubmit={handleAddSource}>
          <input
            placeholder="Адрес кошелька (T…)"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            style={{ minWidth: 320 }}
          />
          <button type="submit" className="btn-save" disabled={addingSource}>
            <IconCheck width={15} height={15} />
            {addingSource ? "..." : "Добавить"}
          </button>
        </form>
        {sourceError && <p className="error-text">{sourceError}</p>}
        {config && config.sources.length === 0 ? (
          <p className="muted">Пока не добавлено ни одного кошелька.</p>
        ) : (
          <ul className="admin-option-list">
            {config?.sources.map((s) => (
              <li key={s.id}>
                <span style={{ wordBreak: "break-all" }}>{s.address}</span>
                <button
                  className="delete-x"
                  title="Удалить кошелёк"
                  aria-label="Удалить кошелёк"
                  onClick={() => deleteSource(s.id)}
                >
                  <IconTrash width={13} height={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 style={{ marginTop: 20 }}>Ключ Tronscan API</h2>
        <p className="muted">
          Снимает лимит запросов (нужен при активном кошельке и для хабов). Бесплатный —{" "}
          <a href="https://tronscan.org" target="_blank" rel="noreferrer">
            tronscan.org
          </a>
          , раздел API keys. {config?.hasTronscanApiKey ? "Ключ задан." : "Ключ не задан."}
        </p>
        <form className="inline-form" onSubmit={saveKey}>
          <input
            placeholder={config?.hasTronscanApiKey ? "Новый ключ (оставьте пустым, чтобы не менять)" : "Ключ Tronscan API"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={clearApiKey}
            style={{ minWidth: 320 }}
          />
          {config?.hasTronscanApiKey && (
            <label className="toggle-inline" title="Убрать ключ — будет использован общий ключ сервера, если он есть">
              <input type="checkbox" checked={clearApiKey} onChange={(e) => setClearApiKey(e.target.checked)} />
              Удалить ключ
            </label>
          )}
          <button type="submit" className="btn-save" disabled={savingKey || (!clearApiKey && !apiKey.trim())}>
            <IconCheck width={15} height={15} />
            {savingKey ? "..." : keySaved ? "Сохранено" : "Сохранить"}
          </button>
        </form>
        {keyError && <p className="error-text">{keyError}</p>}
      </section>

      <section className="admin-field-card fit-content">
        <h2>Получатели (адрес → имя)</h2>
        <p className="muted">
          Кому идут исходящие переводы. «Хаб» — сборный кош сервиса: если сервис каждый раз даёт новый
          адрес, но все они пересылают средства на один кош — отметьте его как хаб, и платежи на такие
          адреса будут засчитаны автоматически (без добавления каждого). Переводы на неопознанные
          адреса не учитываются.
        </p>
        <form className="inline-form" onSubmit={handleAdd}>
          <input placeholder="Адрес назначения (T…)" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          <input placeholder="Имя получателя" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label className="toggle-inline" title="Сборный кош — платежи на адреса, пересылающие сюда, засчитываются этому получателю">
            <input type="checkbox" checked={newIsHub} onChange={(e) => setNewIsHub(e.target.checked)} />
            Хаб
          </label>
          <button type="submit" className="btn-save" disabled={adding}>
            <IconCheck width={15} height={15} />
            {adding ? "..." : "Добавить"}
          </button>
        </form>
        {addError && <p className="error-text">{addError}</p>}

        {config && config.recipients.length === 0 ? (
          <p className="muted">Пока нет ни одного получателя.</p>
        ) : (
          <div className="table-scroll">
            <table className="appeals-table table-auto">
              <thead>
                <tr>
                  <th>Адрес назначения</th>
                  <th>Имя получателя</th>
                  <th className="col-center">Хаб</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {config?.recipients.map((r) => (
                  <RecipientRow key={r.id} recipient={r} onChanged={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
