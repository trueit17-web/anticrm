import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { WalletRecipient } from "../types";
import { IconCheck, IconTrash } from "./icons";

interface WalletConfig {
  address: string | null;
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

  const [address, setAddress] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);

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
      .then((res) => {
        setConfig(res);
        setAddress(res.address ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    setConfigError(null);
    setConfigSaved(false);
    try {
      const payload: { address: string | null; tronscanApiKey?: string | null } = {
        address: address.trim() || null,
      };
      if (clearApiKey) payload.tronscanApiKey = null;
      else if (apiKey.trim()) payload.tronscanApiKey = apiKey.trim();
      await api.patch("/wallet/config", payload);
      setApiKey("");
      setClearApiKey(false);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
      load();
    } catch (err) {
      setConfigError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSavingConfig(false);
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
        <h2>Кошелёк для подсчёта</h2>
        <p className="muted">
          TRON-адрес (T…), исходящие переводы USDT (TRC-20) которого считаются и показываются в
          статистике, сгруппированные по получателям.
        </p>
        {config && !config.enabled && (
          <p className="muted">
            Модуль «Считать кош» выключен для этого филиала — включите его на вкладке «Филиалы»
            (суперадмин), чтобы блок появился в статистике.
          </p>
        )}
        <form className="inline-form" onSubmit={saveConfig}>
          <input
            placeholder="Адрес кошелька (T…)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ minWidth: 320 }}
          />
          <input
            placeholder={
              config?.hasTronscanApiKey
                ? "Ключ Tronscan задан — оставьте пустым, чтобы не менять"
                : "Ключ Tronscan API (необязательно)"
            }
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
          <button type="submit" className="btn-save" disabled={savingConfig}>
            <IconCheck width={15} height={15} />
            {savingConfig ? "..." : configSaved ? "Сохранено" : "Сохранить"}
          </button>
        </form>
        <p className="muted">
          Ключ Tronscan снимает лимит запросов (нужен при активном кошельке и для хабов). Бесплатный —{" "}
          <a href="https://tronscan.org" target="_blank" rel="noreferrer">
            tronscan.org
          </a>
          , раздел API keys.
        </p>
        {configError && <p className="error-text">{configError}</p>}
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
