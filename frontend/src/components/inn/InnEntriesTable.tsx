import { KeyboardEvent, useState } from "react";
import { InnEntry } from "../../types";
import { IconCheck, IconTrash } from "../icons";

function warningClass(level: InnEntry["warningLevel"]): string {
  if (level === "red") return "inn-cell-warn-red";
  if (level === "yellow") return "inn-cell-warn-yellow";
  return "";
}

// A row's editable buffer (ИНН/Контактов/Передано) is local and only
// applied — via Enter in any field or the checkmark button — never on every
// keystroke, per the module's "apply explicitly" requirement.
function EntryRow({
  entry,
  onApply,
  onDelete,
}: {
  entry: InnEntry;
  onApply: (id: number, data: { inn?: string; contactsCount?: number; transferredCount?: number }) => void;
  onDelete: (id: number) => void;
}) {
  const [inn, setInn] = useState(entry.inn);
  const [contacts, setContacts] = useState(String(entry.contactsCount));
  const [transferred, setTransferred] = useState(String(entry.transferredCount));

  const dirty =
    inn !== entry.inn || Number(contacts) !== entry.contactsCount || Number(transferred) !== entry.transferredCount;

  function apply() {
    if (!dirty || !inn.trim()) return;
    const data: { inn?: string; contactsCount?: number; transferredCount?: number } = {};
    if (inn !== entry.inn) data.inn = inn.trim();
    if (Number(contacts) !== entry.contactsCount) data.contactsCount = Number(contacts) || 0;
    if (Number(transferred) !== entry.transferredCount) data.transferredCount = Number(transferred) || 0;
    onApply(entry.id, data);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  }

  return (
    <tr>
      <td>{entry.companyName || "—"}</td>
      <td>{entry.region || "—"}</td>
      <td className={warningClass(entry.warningLevel)}>
        <input value={inn} onChange={(e) => setInn(e.target.value)} onKeyDown={handleKeyDown} />
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
          disabled={!dirty || !inn.trim()}
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

function NewEntryRow({ onCreate }: { onCreate: (data: { inn: string; contactsCount: number; transferredCount: number }) => void }) {
  const [inn, setInn] = useState("");
  const [contacts, setContacts] = useState("0");
  const [transferred, setTransferred] = useState("0");

  function apply() {
    if (!inn.trim()) return;
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
      <td>—</td>
      <td>—</td>
      <td>
        <input
          value={inn}
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
        <button className="icon-btn" disabled={!inn.trim()} onClick={apply} title="Добавить" aria-label="Добавить">
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
}: {
  entries: InnEntry[];
  onCreate: (data: { inn: string; contactsCount: number; transferredCount: number }) => void;
  onUpdate: (id: number, data: { inn?: string; contactsCount?: number; transferredCount?: number }) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <table className="inn-entries-table">
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
          <EntryRow key={entry.id} entry={entry} onApply={onUpdate} onDelete={onDelete} />
        ))}
        <NewEntryRow onCreate={onCreate} />
      </tbody>
    </table>
  );
}
