import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { PetConfig, PetRule, PetTrigger, SelectOption } from "../types";
import { IconCheck, IconEdit, IconTrash, IconX } from "./icons";
import { MOBILE_OPERATORS } from "../lib/mobileOperator";
import {
  CHATTINESS_LABELS,
  DAILY_COUNT_OPTIONS,
  fillExample,
  guessTrigger,
  moodForTrigger,
  PetSprite,
  SKINS,
  TRIGGER_LABELS,
} from "./pet/petShared";

// Base triggers offered in the condition dropdown (parametrized ones — status,
// carrier, daily count — are added below as separate groups).
const BASE_TRIGGERS: PetTrigger[] = ["no_sms", "big_dep", "nedozhal", "stalled", "custom"];

// The condition <select> encodes a parametrized trigger as "<trigger>:<param>"
// so one control can offer fixed triggers plus per-branch statuses, carriers
// and count thresholds.
function encodeCond(trigger: PetTrigger, param: string | null): string {
  return param ? `${trigger}:${param}` : trigger;
}
function decodeCond(cond: string): { trigger: PetTrigger; param: string | null } {
  const i = cond.indexOf(":");
  if (i >= 0) return { trigger: cond.slice(0, i) as PetTrigger, param: cond.slice(i + 1) };
  return { trigger: cond as PetTrigger, param: null };
}
function ruleLabel(trigger: PetTrigger, param: string | null): string {
  if (!param) return TRIGGER_LABELS[trigger];
  if (trigger === "status") return `Статус «${param}»`;
  if (trigger === "phone_operator") return `Оператор ${param}`;
  if (trigger === "daily_count") return param === "6" ? "Трубок за день больше 5" : `Трубок за день ≥ ${param}`;
  return TRIGGER_LABELS[trigger];
}

// The condition <select> (fixed triggers + per-branch statuses, carriers and
// count thresholds), shared by the "teach" form and the inline rule editor.
function CondSelect({
  value,
  statuses,
  onChange,
}: {
  value: string;
  statuses: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {BASE_TRIGGERS.map((t) => (
        <option key={t} value={t}>
          {TRIGGER_LABELS[t]}
        </option>
      ))}
      {statuses.length > 0 && (
        <optgroup label="Статусы филиала">
          {statuses.map((s) => (
            <option key={s} value={`status:${s}`}>
              Статус «{s}»
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Оператор номера">
        {MOBILE_OPERATORS.map((c) => (
          <option key={c} value={`phone_operator:${c}`}>
            Оператор {c}
          </option>
        ))}
      </optgroup>
      <optgroup label="Трубок за день">
        {DAILY_COUNT_OPTIONS.map((o) => (
          <option key={o.threshold} value={`daily_count:${o.threshold}`}>
            {o.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

// One rule row: read-only by default, switches to an inline editor (message +
// condition) on the pencil. Toggle and delete work in both states.
function RuleRow({
  rule,
  statuses,
  onToggle,
  onDelete,
  onSaved,
}: {
  rule: PetRule;
  statuses: string[];
  onToggle: (r: PetRule) => void;
  onDelete: (id: number) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(rule.message);
  const [cond, setCond] = useState(encodeCond(rule.trigger, rule.param));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!message.trim()) return;
    const { trigger, param } = decodeCond(cond);
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/pet/rules/${rule.id}`, { trigger, param, message: message.trim() });
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setMessage(rule.message);
    setCond(encodeCond(rule.trigger, rule.param));
    setErr(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="pet-rule-editing">
        <div className="pet-rule-edit">
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} autoFocus />
          <div className="pet-teach-row">
            <label className="pet-teach-cond">
              При:{" "}
              <CondSelect value={cond} statuses={statuses} onChange={setCond} />
            </label>
            <button type="button" className="btn-save" onClick={save} disabled={busy || !message.trim()}>
              <IconCheck width={14} height={14} />
              {busy ? "..." : "Сохранить"}
            </button>
            <button type="button" className="btn-cancel" onClick={cancel} disabled={busy}>
              <IconX width={14} height={14} />
              Отмена
            </button>
          </div>
          {err && <p className="error-text">{err}</p>}
        </div>
      </li>
    );
  }

  return (
    <li style={{ opacity: rule.enabled ? 1 : 0.5 }}>
      <span>
        <span className="pet-rule-tag">{ruleLabel(rule.trigger, rule.param)}</span> {rule.message}
      </span>
      <span className="admin-option-actions">
        <button className="icon-btn" title="Редактировать" aria-label="Редактировать" onClick={() => setEditing(true)}>
          <IconEdit width={15} height={15} />
        </button>
        <label className="toggle-inline" title={rule.enabled ? "Выключить правило" : "Включить правило"}>
          <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule)} />
        </label>
        <button className="icon-btn" title="Удалить" aria-label="Удалить" onClick={() => onDelete(rule.id)}>
          <IconTrash width={15} height={15} />
        </button>
      </span>
    </li>
  );
}

export function PetManager() {
  const [config, setConfig] = useState<PetConfig | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // profile draft
  const [name, setName] = useState("");
  const [skin, setSkin] = useState("fox");
  const [chattiness, setChattiness] = useState(1);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // new rule draft — `cond` is the encoded dropdown value (see encodeCond).
  const [cond, setCond] = useState<string>("no_sms");
  // Once the admin picks a condition by hand we stop auto-guessing it from the
  // text, so their choice isn't overwritten on the next keystroke.
  const [condTouched, setCondTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  function onMessageChange(text: string) {
    setMessage(text);
    if (!condTouched) {
      const g = guessTrigger(text, statuses);
      setCond(encodeCond(g.trigger, g.param));
    }
  }

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
  useEffect(() => {
    load();
    // Real, per-branch statuses the pet can react to.
    api
      .get<{ options: SelectOption[] }>("/select-options")
      .then((res) => setStatuses(res.options.filter((o) => o.field === "STATUS").map((o) => o.value)))
      .catch(() => {});
  }, []);

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
    const { trigger, param } = decodeCond(cond);
    setAdding(true);
    setRuleError(null);
    try {
      await api.post("/pet/rules", { trigger, param, message: message.trim() });
      setMessage("");
      setCond("no_sms");
      setCondTouched(false);
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

  const previewTrigger = decodeCond(cond).trigger;

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
          Питомец применяет правила к строкам таблицы. Стандартные правила уже добавлены — их можно
          редактировать (карандаш), выключать или удалять, как и свои. В тексте доступны подстановки{" "}
          <code>{"{op}"}</code> (оператор), <code>{"{dep}"}</code> (деп), <code>{"{phone}"}</code>.
        </p>

        <ul className="admin-option-list">
          {config?.rules.length === 0 && <li className="muted">Правил пока нет — научите питомца ниже.</li>}
          {config?.rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              statuses={statuses}
              onToggle={toggleRule}
              onDelete={deleteRule}
              onSaved={load}
            />
          ))}
        </ul>

        <h3 className="pet-teach-title">🎓 Научить питомца</h3>
        <p className="muted">
          Просто напишите подсказку своими словами — питомец сам поймёт, когда её показывать (по
          ключевым словам «смс», «деп», «недожал», «завис…», по названиям ваших статусов, оператору
          номера — «МТС», «Билайн»… — и по числу трубок «за день»). Условие можно поправить вручную. В
          тексте доступна ещё подстановка <code>{"{count}"}</code> — число трубок за день.
        </p>
        <form className="pet-teach-form" onSubmit={addRule}>
          <input
            placeholder="Текст подсказки, напр.: 💰 {op}: крупный деп {dep} — проверь код"
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            maxLength={200}
          />
          <div className="pet-teach-row">
            <label className="pet-teach-cond">
              Питомец покажет это при:{" "}
              <CondSelect
                value={cond}
                statuses={statuses}
                onChange={(v) => {
                  setCond(v);
                  setCondTouched(true);
                }}
              />
            </label>
            <button type="submit" disabled={adding || !message.trim()}>
              {adding ? "..." : "Научить"}
            </button>
          </div>
        </form>
        {ruleError && <p className="error-text">{ruleError}</p>}

        {message.trim() && (
          <div className="pet-preview">
            <PetSprite skin={skin as PetConfig["profile"]["skin"]} emo={moodForTrigger(previewTrigger)} size={48} />
            <div className="pet-preview-bubble">{fillExample(message)}</div>
          </div>
        )}
      </section>
    </div>
  );
}
