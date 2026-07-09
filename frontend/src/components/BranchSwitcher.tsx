import { useEffect, useState } from "react";
import { api, getActiveBranchId, setActiveBranchId } from "../api/client";
import { Branch } from "../types";

// SUPERADMIN-only control: picks which branch the rest of the app acts on.
// Reloads the page on change so every already-loaded list refetches scoped
// to the new branch, instead of threading a live branchId through every page.
export function BranchSwitcher() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [value, setValue] = useState<string>(String(getActiveBranchId() ?? ""));

  useEffect(() => {
    api
      .get<{ branches: Branch[] }>("/branches")
      .then((res) => setBranches(res.branches))
      .catch(() => {});
  }, []);

  function handleChange(id: string) {
    setValue(id);
    setActiveBranchId(id ? Number(id) : null);
    window.location.reload();
  }

  return (
    <select
      className="branch-switcher"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      title="Выбранный филиал"
    >
      <option value="">Выберите филиал</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
