import { useEffect, useState } from "react";
import { api, getActiveBranchId, setActiveBranchId } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Branch } from "../types";

// Lets anyone who can act on more than one branch (SUPERADMIN, or a manager
// granted extra branch access) pick which one the rest of the app uses.
// Hides itself once branches are loaded if there's nothing to switch between.
// Reloads the page on change so every already-loaded list refetches scoped
// to the new branch, instead of threading a live branchId through every page.
export function BranchSwitcher() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [value, setValue] = useState<string>(String(getActiveBranchId() ?? ""));

  useEffect(() => {
    api
      .get<{ branches: Branch[] }>("/branches/mine")
      .then((res) => setBranches(res.branches))
      .catch(() => setBranches([]));
  }, []);

  if (!branches) return null;
  // SUPERADMIN always needs explicit branch selection, even with just one
  // branch to pick from; everyone else only needs the switcher once there's
  // more than one branch to choose between.
  const needsSwitcher = user?.role === "SUPERADMIN" || branches.length > 1;
  if (!needsSwitcher) {
    return null;
  }

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
