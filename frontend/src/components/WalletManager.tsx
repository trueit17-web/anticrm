import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { WalletRecipient } from "../types";
import { IconCheck, IconTrash } from "./icons";

interface WalletConfig {
  address: string | null;
  enabled: boolean;
  recipients: WalletRecipient[];
}

function RecipientRow({ recipient, onChanged }: { recipient: WalletRecipient; onChanged: () => void }) {
  const [address, setAddress] = useState(recipient.address);
  const [name, setName] = useState(recipient.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = address !== recipient.address || name !== recipient.name;

  async function save() {
    if (!address.trim() || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/wallet/recipients/${recipient.id}`, { address: address.trim(), name: name.trim() });
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
  const [savingAddr, setSavingAddr] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [addrSaved, setAddrSaved] = useState(false);

  const [newAddress, setNewAddress] = useState("");
  const [newName, setNewName] = useState("");
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

  async function saveAddress(e: FormEvent) {
    e.preventDefault();
    setSavingAddr(true);
    setAddrError(null);
    setAddrSaved(false);
    try {
      await api.patch("/wallet/config", { address: address.trim() || null });
      setAddrSaved(true);
      setTimeout(() => setAddrSaved(false), 2000);
      load();
    } catch (err) {
      setAddrError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSavingAddr(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newAddress.trim() || !newName.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.post("/wallet/recipients", { address: newAddress.trim(), name: newName.trim() });
      setNewAddress("");
      setNewName("");
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
        <form className="inline-form" onSubmit={saveAddress}>
          <input
            placeholder="Адрес кошелька (T…)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ minWidth: 320 }}
          />
          <button type="submit" className="btn-save" disabled={savingAddr}>
            <IconCheck width={15} height={15} />
            {savingAddr ? "..." : addrSaved ? "Сохранено" : "Сохранить"}
          </button>
        </form>
        {addrError && <p className="error-text">{addrError}</p>}
      </section>

      <section className="admin-field-card fit-content">
        <h2>Получатели (адрес → имя)</h2>
        <p className="muted">
          Кому идут исходящие переводы. Адрес назначения без сопоставления показывается как «Другое».
        </p>
        <form className="inline-form" onSubmit={handleAdd}>
          <input placeholder="Адрес назначения (T…)" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          <input placeholder="Имя получателя" value={newName} onChange={(e) => setNewName(e.target.value)} />
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
