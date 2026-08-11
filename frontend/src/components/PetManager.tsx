import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { PetConfig, PetRule, PetTrigger } from "../types";
import { IconCheck, IconTrash } from "./icons";
import { CHATTINESS_LABELS, DEFAULT_RULES, PetSprite, SKINS, TRIGGER_LABELS } from "./pet/petShared";

const RULE_TRIGGERS: PetTrigger[] = ["no_sms", "big_dep", "nedozhal", "stalled", "custom"];

export function PetManager() {
  const [config, setConfig] = useState<PetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // profile draft
  const [name, setName] = useState("");
  const [skin, setSkin] = useState("fox");
  const [chattiness, setChattiness] = useState(1);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // new rule draft
  const [trigger, setTrigger] = useState<PetTrigger>("no_sms");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<PetConfig>("/pet/config")
      .then((res) => {
        setConfig(res);
        setName(res.profile.name);
        setSkin(res.profile.skin);
        setChattiness(res.profile.chattiness);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSaved(false);
    setError(null);
    try {
      await api.patch("/pet/profile", { name: name.trim(), skin, chattiness });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSavingProfile(false);
    }
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setAdding(true);
    setRuleError(null);
    try {
      await api.post("/pet/rules", { trigger, message: message.trim() });
      setMessage("");
      load();
    } catch (err) {
      setRuleError(err instanceof ApiError ? err.message : "Не удалось добавить");
    } finally {
      setAdding(false);
    }
  }

  async function toggleRule(r: PetRule) {
    await api.patch(`/pet/rules/${r.id}`, { enabled: !r.enabled });
    load();
  }

  async function deleteRule(id: number) {
    await api.delete(`/pet/rules/${id}`);
    load();
  }

  if (loading) return <p className="muted">Загрузка...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="admin-fields-grid">
      <section className="admin-field-card fit-content">
        <h2>Питомец</h2>
        {config && !config.enabled && (
          <p className="muted">
            Модуль «Питомец» выключен для этого филиала — включите его на вкладке «Филиалы»
            (суперадмин), чтобы он появился на страницах.
          </p>
        )}
        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "6px 0 12px" }}>
          <PetSprite skin={skin as PetConfig["profile"]["skin"]} emo="happy" size={64} />
          <p className="muted" style={{ margin: 0 }}>
            Ходит по таблице трубок, показывает эмоции и подсказки по правилам ниже.
          </p>
        </div>
        <form className="inline-form" onSubmit={saveProfile}>
          <input placeholder="Имя питомца" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
          <select value={skin} onChange={(e) => setSkin(e.target.value)}>
            {SKINS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.emoji} {s.label}
              </option>
            ))}
          </select>
          <select value={chattiness} onChange={(e) => setChattiness(Number(e.target.value))}>
            {CHATTINESS_LABELS.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-save" disabled={savingProfile}>
            <IconCheck width={15} height={15} />
            {savingProfile ? "..." : profileSaved ? "Сохранено" : "Сохранить"}
          </button>
        </form>
      </section>

      <section className="admin-field-card fit-content">
        <h2>Правила-подсказки</h2>
        <p className="muted">
          Питомец применяет правила к строкам таблицы. Базовые правила встроены; здесь можно добавить
          свои. В тексте доступны подстановки <code>{"{op}"}</code> (оператор), <code>{"{dep}"}</code>{" "}
          (деп), <code>{"{phone}"}</code>.
        </p>

        <ul className="admin-option-list">
          {DEFAULT_RULES.map((r, i) => (
            <li key={"def" + i}>
              <span>
                <span className="pet-rule-tag">{TRIGGER_LABELS[r.trigger]}</span> {r.message}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                базовое
              </span>
            </li>
          ))}
          {config?.rules.map((r) => (
            <li key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
              <span>
                <span className="pet-rule-tag">{TRIGGER_LABELS[r.trigger]}</span> {r.message}
              </span>
              <span className="admin-option-actions">
                <label className="toggle-inline" title={r.enabled ? "Выключить правило" : "Включить правило"}>
                  <input type="checkbox" checked={r.enabled} onChange={() => toggleRule(r)} />
                </label>
                <button className="icon-btn" title="Удалить" aria-label="Удалить" onClick={() => deleteRule(r.id)}>
                  <IconTrash width={15} height={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>

        <form className="inline-form" onSubmit={addRule}>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as PetTrigger)}>
            {RULE_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            placeholder="Текст подсказки, напр.: 💰 {op}: крупный деп {dep} — проверь код"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ minWidth: 340 }}
            maxLength={200}
          />
          <button type="submit" disabled={adding}>
            {adding ? "..." : "Научить"}
          </button>
        </form>
        {ruleError && <p className="error-text">{ruleError}</p>}
      </section>
    </div>
  );
}
