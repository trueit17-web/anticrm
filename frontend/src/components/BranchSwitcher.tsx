import { useEffect, useState } from "react";
import { api, getActiveBranchId, setActiveBranchId } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Branch } from "../types";

// Lets anyone who can act on more than one branch (SUPERADMIN, or a manager
// granted extra branch access) pick which one the rest of the app uses.
// Hides itself once branches are loaded if there's nothing to switch between.
// Reloads the page on change so every already-loaded list refetches scoped
// to the new branch, instead of threading a live branchId through every page.
//
// Flip through branch names with the arrow buttons rather than picking from
// a dropdown list — quicker when there's only a handful of branches, which
// is the common case.
export function BranchSwitcher() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(getActiveBranchId());

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

  function selectBranch(id: number) {
    setActiveId(id);
    setActiveBranchId(id);
    window.location.reload();
  }

  function step(delta: 1 | -1) {
    if (branches!.length === 0) return;
    const currentIndex = branches!.findIndex((b) => b.id === activeId);
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : branches!.length - 1
        : (currentIndex + delta + branches!.length) % branches!.length;
    selectBranch(branches![nextIndex].id);
  }

  const current = branches.find((b) => b.id === activeId);

  return (
    <div className="branch-switcher" title="Выбранный филиал">
      <button
        type="button"
        className="branch-switcher-btn"
        onClick={() => step(-1)}
        disabled={branches.length < 2}
        aria-label="Предыдущий филиал"
      >
        ‹
      </button>
      <span className="branch-switcher-name">{current?.name ?? "Выберите филиал"}</span>
      <button
        type="button"
        className="branch-switcher-btn"
        onClick={() => step(1)}
        disabled={branches.length < 2}
        aria-label="Следующий филиал"
      >
        ›
      </button>
    </div>
  );
}
