import { ClipboardEvent, KeyboardEvent, useState } from "react";
import { InnCheckResult, InnEntry } from "../../types";
import { IconCheck, IconTrash } from "../icons";

type UpdateData = {
  inn?: string;
  contactsCount?: number;
  transferredCount?: number;
  called?: boolean;
  category?: string | null;
  note?: string | null;
};

type CreateData = {
  inn: string;
  contactsCount: number;
  transferredCount: number;
  called: boolean;
  category: string | null;
  note: string | null;
};

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

function CategorySelect({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

// A row's editable buffer (ИНН/Контактов/Передано/Примеч.) is local and
// only applied — via Enter in any field, blur, or the checkmark button —
// never on every keystroke, per the module's "apply explicitly" requirement.
// "Прозвонена?" and "Категория" are the exception: both are discrete
// choices, not free typing, so they apply immediately on change.
function EntryRow({
  entry,
  onApply,
  onDelete,
  checkWarning,
  highlightId,
  categories,
}: {
  entry: InnEntry;
  onApply: (id: number, data: UpdateData) => void;
  onDelete: (id: number) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
  highlightId: number | null;
  categories: string[];
}) {
  const [inn, setInn] = useState(entry.inn);
  const [contacts, setContacts] = useState(String(entry.contactsCount));
  const [transferred, setTransferred] = useState(String(entry.transferredCount));
  const [note, setNote] = useState(entry.note ?? "");
  const [checking, setChecking] = useState(false);

  const dirty =
    inn !== entry.inn ||
    Number(contacts) !== entry.contactsCount ||
    Number(transferred) !== entry.transferredCount ||
    note !== (entry.note ?? "");

  async function apply() {
    if (!dirty || !inn.trim() || checking) return;
    const data: UpdateData = {};
    if (inn !== entry.inn) data.inn = inn.trim();
    if (Number(contacts) !== entry.contactsCount) data.contactsCount = Number(contacts) || 0;
    if (Number(transferred) !== entry.transferredCount) data.transferredCount = Number(transferred) || 0;
    if (note !== (entry.note ?? "")) data.note = note.trim() || null;

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
      <td className="inn-col-name inn-col-truncate" title={entry.companyName || undefined}>
        {entry.companyName || "—"}
      </td>
      <td className="inn-col-region inn-col-truncate" title={entry.region || undefined}>
        {entry.region || "—"}
      </td>
      <td className="inn-col-inn">
        <input
          value={inn}
          maxLength={10}
          onChange={(e) => setInn(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={apply}
        />
      </td>
      <td className="inn-col-center">
        <input
          type="number"
          min={0}
          value={contacts}
          onChange={(e) => setContacts(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={apply}
        />
      </td>
      <td className="inn-col-center">
        <input
          type="number"
          min={0}
          value={transferred}
          onChange={(e) => setTransferred(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={apply}
        />
      </td>
      <td>
        <CategorySelect
          value={entry.category ?? ""}
          categories={categories}
          onChange={(value) => onApply(entry.id, { category: value || null })}
        />
      </td>
      <td>
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={handleKeyDown} onBlur={apply} />
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

// Splits pasted text into individual ИНН — accepts one per line (typical
// when copying a column out of Excel) or separated by commas/semicolons/
// spaces. Only tokens that look like a real ИНН (10 or 12 digits) count.
function extractInnList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => /^\d{10}$|^\d{12}$/.test(t));
}

function NewEntryRow({
  onCreate,
  onCreateMany,
  checkWarning,
  categories,
}: {
  onCreate: (data: CreateData) => void;
  onCreateMany: (inns: string[]) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
  categories: string[];
}) {
  const [inn, setInn] = useState("");
  const [contacts, setContacts] = useState("0");
  const [transferred, setTransferred] = useState("0");
  const [called, setCalled] = useState(false);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);

  async function apply() {
    if (!inn.trim() || checking) return;
    setChecking(true);
    const ok = await confirmIfRepeated(checkWarning, inn.trim());
    setChecking(false);
    if (!ok) return;
    onCreate({
      inn: inn.trim(),
      contactsCount: Number(contacts) || 0,
      transferredCount: Number(transferred) || 0,
      called,
      category: category || null,
      note: note.trim() || null,
    });
    setInn("");
    setContacts("0");
    setTransferred("0");
    setCalled(false);
    setCategory("");
    setNote("");
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  }

  // Pasting a whole list of ИНН (one per line, or comma/space-separated —
  // the usual shape when copying a column out of a spreadsheet) creates a
  // separate row for each one instead of dumping the raw text into the
  // field. A single pasted ИНН falls through to the normal one-at-a-time
  // flow so the operator can still review/confirm it before saving.
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const list = extractInnList(text);
    if (list.length > 1) {
      e.preventDefault();
      onCreateMany(list);
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
          onPaste={handlePaste}
          placeholder="Новый ИНН (можно вставить список)"
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
      <td>
        <CategorySelect value={category} categories={categories} onChange={setCategory} />
      </td>
      <td>
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={handleKeyDown} placeholder="Примечание" />
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
  onCreateMany,
  onUpdate,
  onDelete,
  checkWarning,
  highlightId,
  categories,
}: {
  entries: InnEntry[];
  onCreate: (data: CreateData) => void;
  onCreateMany: (inns: string[]) => void;
  onUpdate: (id: number, data: UpdateData) => void;
  onDelete: (id: number) => void;
  checkWarning: (inn: string) => Promise<InnCheckResult>;
  highlightId: number | null;
  categories: string[];
}) {
  return (
    <table className="inn-entries-table">
      <colgroup>
        <col className="inn-col-name" />
        <col className="inn-col-region" />
        <col className="inn-col-inn" />
        <col className="inn-col-num" />
        <col className="inn-col-num" />
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
          <th>Кат.</th>
          <th>Примеч.</th>
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
            categories={categories}
          />
        ))}
        <NewEntryRow onCreate={onCreate} onCreateMany={onCreateMany} checkWarning={checkWarning} categories={categories} />
      </tbody>
    </table>
  );
}
