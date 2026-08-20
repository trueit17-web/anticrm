import { KeyboardEvent, useState } from "react";
import { InnCheckResult, InnEntry } from "../../types";
import { IconCheck, IconTrash } from "../icons";

function rowWarningClass(level: InnEntry["warningLevel"]): string {
  if (level === "red") return "inn-row-warn-red";
  if (level === "yellow") return "inn-row-warn-yellow";
  return "";
}

function daysAgo(lastDate: string): number {
  const ms = Date.now() - new Date(lastDate).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

// Asks the backend whether this ИНН was already logged recently and, if so,
// confirms with the operator before the caller proceeds to save. Returns
// true when it's fine to save (no repeat, or the operator confirmed anyway).
async function confirmIfRepeated(
  checkWarning: (inn: string) => Promise<InnCheckResult>,
  inn: string
): Promise<boolean> {
  let result: InnCheckResult;
  try {
    result = await checkWarning(inn);
  } catch {
    return true; // preview failing shouldn't block the actual save
  }
  if (!result.warningLevel || !result.lastDate) return true;
  const when = result.warningLevel === "red" ? "меньше месяца назад" : "1–2 месяца назад";
  return window.confirm(`Этот ИНН уже встречался ${when} (${daysAgo(result.lastDate)} дн. назад). Сохранить всё равно?`);
}

// A row's editable buffer (ИНН/Контактов/Передано) is local and only
// applied — via Enter in any field or the checkmark button — never on every
// keystroke, per the module's "apply explicitly" requirement.
function EntryRow({
  entry,
  onApply,
  onDelete,
  checkWarning,
}: {
  entry: InnEntry;
  onApply: (id: number, data: { inn?: string; contactsCount?: number; transferredCount?: number }) => void;
  onDelete: (id: number) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
}) {
  const [inn, setInn] = useState(entry.inn);
  const [contacts, setContacts] = useState(String(entry.contactsCount));
  const [transferred, setTransferred] = useState(String(entry.transferredCount));
  const [checking, setChecking] = useState(false);

  const dirty =
    inn !== entry.inn || Number(contacts) !== entry.contactsCount || Number(transferred) !== entry.transferredCount;

  async function apply() {
    if (!dirty || !inn.trim() || checking) return;
    const data: { inn?: string; contactsCount?: number; transferredCount?: number } = {};
    if (inn !== entry.inn) data.inn = inn.trim();
    if (Number(contacts) !== entry.contactsCount) data.contactsCount = Number(contacts) || 0;
    if (Number(transferred) !== entry.transferredCount) data.transferredCount = Number(transferred) || 0;

    if (data.inn) {
      setChecking(true);
      const ok = await confirmIfRepeated(checkWarning, data.inn);
      setChecking(false);
      if (!ok) return;
    }
    onApply(entry.id, data);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  }

  return (
    <tr className={rowWarningClass(entry.warningLevel)}>
      <td className="inn-col-name">{entry.companyName || "—"}</td>
      <td className="inn-col-region">{entry.region || "—"}</td>
      <td className="inn-col-inn">
        <input value={inn} maxLength={10} onChange={(e) => setInn(e.target.value)} onKeyDown={handleKeyDown} />
      </td>
      <td className="inn-col-center">
        <input
          type="number"
          min={0}
          value={contacts}
          onChange={(e) => setContacts(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
      <td className="inn-col-center">
        <input
          type="number"
          min={0}
          value={transferred}
          onChange={(e) => setTransferred(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
      <td className="inn-col-center inn-row-actions">
        <button
          className="icon-btn"
          disabled={!dirty || !inn.trim() || checking}
          onClick={apply}
          title="Применить"
          aria-label="Применить"
        >
          <IconCheck />
        </button>
        <button className="icon-btn" onClick={() => onDelete(entry.id)} title="Удалить" aria-label="Удалить">
          <IconTrash />
        </button>
      </td>
    </tr>
  );
}

function NewEntryRow({
  onCreate,
  checkWarning,
}: {
  onCreate: (data: { inn: string; contactsCount: number; transferredCount: number }) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
}) {
  const [inn, setInn] = useState("");
  const [contacts, setContacts] = useState("0");
  const [transferred, setTransferred] = useState("0");
  const [checking, setChecking] = useState(false);

  async function apply() {
    if (!inn.trim() || checking) return;
    setChecking(true);
    const ok = await confirmIfRepeated(checkWarning, inn.trim());
    setChecking(false);
    if (!ok) return;
    onCreate({ inn: inn.trim(), contactsCount: Number(contacts) || 0, transferredCount: Number(transferred) || 0 });
    setInn("");
    setContacts("0");
    setTransferred("0");
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  }

  return (
    <tr className="inn-new-row">
      <td className="inn-col-name">—</td>
      <td className="inn-col-region">—</td>
      <td className="inn-col-inn">
        <input
          value={inn}
          maxLength={10}
          onChange={(e) => setInn(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Новый ИНН"
        />
      </td>
      <td className="inn-col-center">
        <input
          type="number"
          min={0}
          value={contacts}
          onChange={(e) => setContacts(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
      <td className="inn-col-center">
        <input
          type="number"
          min={0}
          value={transferred}
          onChange={(e) => setTransferred(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
      <td className="inn-col-center">
        <button
          className="icon-btn"
          disabled={!inn.trim() || checking}
          onClick={apply}
          title="Добавить"
          aria-label="Добавить"
        >
          <IconCheck />
        </button>
      </td>
    </tr>
  );
}

export function InnEntriesTable({
  entries,
  onCreate,
  onUpdate,
  onDelete,
  checkWarning,
}: {
  entries: InnEntry[];
  onCreate: (data: { inn: string; contactsCount: number; transferredCount: number }) => void;
  onUpdate: (id: number, data: { inn?: string; contactsCount?: number; transferredCount?: number }) => void;
  onDelete: (id: number) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
}) {
  return (
    <table className="inn-entries-table">
      <colgroup>
        <col className="inn-col-name" />
        <col className="inn-col-region" />
        <col className="inn-col-inn" />
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Название</th>
          <th>Регион</th>
          <th>ИНН</th>
          <th>Контактов</th>
          <th>Передано</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} onApply={onUpdate} onDelete={onDelete} checkWarning={checkWarning} />
        ))}
        <NewEntryRow onCreate={onCreate} checkWarning={checkWarning} />
      </tbody>
    </table>
  );
}
