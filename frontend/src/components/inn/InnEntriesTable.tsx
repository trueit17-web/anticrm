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
// keystroke, per the module's "apply explicitly" requirement. "Прозвонена?"
// is the exception: it's a status flag, not text entry, so toggling it
// applies immediately rather than waiting for Enter/checkmark.
function EntryRow({
  entry,
  onApply,
  onDelete,
  checkWarning,
  highlightId,
}: {
  entry: InnEntry;
  onApply: (id: number, data: { inn?: string; contactsCount?: number; transferredCount?: number; called?: boolean }) => void;
  onDelete: (id: number) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
  highlightId: number | null;
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

  const classes = [rowWarningClass(entry.warningLevel)];
  if (entry.called) classes.push("inn-row-called");
  if (highlightId === entry.id) classes.push("inn-row-highlight");

  return (
    <tr className={classes.filter(Boolean).join(" ")} data-inn-entry-id={entry.id}>
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
      <td className="inn-col-center">
        <input
          type="checkbox"
          checked={entry.called}
          onChange={(e) => onApply(entry.id, { called: e.target.checked })}
          title="Прозвонена?"
          aria-label="Прозвонена?"
        />
      </td>
    </tr>
  );
}

function NewEntryRow({
  onCreate,
  checkWarning,
}: {
  onCreate: (data: { inn: string; contactsCount: number; transferredCount: number; called: boolean }) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
}) {
  const [inn, setInn] = useState("");
  const [contacts, setContacts] = useState("0");
  const [transferred, setTransferred] = useState("0");
  const [called, setCalled] = useState(false);
  const [checking, setChecking] = useState(false);

  async function apply() {
    if (!inn.trim() || checking) return;
    setChecking(true);
    const ok = await confirmIfRepeated(checkWarning, inn.trim());
    setChecking(false);
    if (!ok) return;
    onCreate({ inn: inn.trim(), contactsCount: Number(contacts) || 0, transferredCount: Number(transferred) || 0, called });
    setInn("");
    setContacts("0");
    setTransferred("0");
    setCalled(false);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  }

  return (
    <tr className={called ? "inn-new-row inn-row-called" : "inn-new-row"}>
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
      <td className="inn-col-center">
        <input
          type="checkbox"
          checked={called}
          onChange={(e) => setCalled(e.target.checked)}
          title="Прозвонена?"
          aria-label="Прозвонена?"
        />
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
  highlightId,
}: {
  entries: InnEntry[];
  onCreate: (data: { inn: string; contactsCount: number; transferredCount: number; called: boolean }) => void;
  onUpdate: (id: number, data: { inn?: string; contactsCount?: number; transferredCount?: number; called?: boolean }) => void;
  onDelete: (id: number) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
  highlightId: number | null;
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
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Название</th>
          <th>Регион</th>
          <th>ИНН</th>
          <th>Чел.</th>
          <th>Передано</th>
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            onApply={onUpdate}
            onDelete={onDelete}
            checkWarning={checkWarning}
            highlightId={highlightId}
          />
        ))}
        <NewEntryRow onCreate={onCreate} checkWarning={checkWarning} />
      </tbody>
    </table>
  );
}
