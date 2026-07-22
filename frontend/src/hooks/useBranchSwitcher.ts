import { useEffect, useState } from "react";
import { api, getActiveBranchId, setActiveBranchId } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Branch } from "../types";

// Shared logic behind every branch switcher control in the app — fetches
// the branches the current user may act on, tracks which one is active, and
// steps forward/backward through the list (wrapping around at the ends).
// Presentational components (BranchSwitcher, the main page's flanking
// arrows) just render around this.
export function useBranchSwitcher() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[] | null>(null);

  useEffect(() => {
    api
      .get<{ branches: Branch[] }>("/branches/mine")
      .then((res) => setBranches(res.branches))
      .catch(() => setBranches([]));
  }, []);

  const loaded = branches !== null;
  const activeId = getActiveBranchId();
  const currentIndex = branches ? branches.findIndex((b) => b.id === activeId) : -1;
  // No explicit selection yet, but there's only one branch to act on anyway
  // (the common case for non-SUPERADMIN accounts) — treat it as current.
  const current =
    currentIndex >= 0
      ? branches![currentIndex]
      : branches && branches.length === 1 && activeId === null
        ? branches[0]
        : null;

  // SUPERADMIN always needs explicit branch selection, even with just one
  // branch to pick from; everyone else only needs the switcher once there's
  // more than one branch to choose between.
  const needsSwitcher = loaded && (user?.role === "SUPERADMIN" || (branches?.length ?? 0) > 1);
  const canStep = (branches?.length ?? 0) >= 2;

  function target(delta: 1 | -1): Branch | null {
    if (!branches || branches.length === 0) return null;
    const nextIndex =
      currentIndex === -1 ? (delta > 0 ? 0 : branches.length - 1) : (currentIndex + delta + branches.length) % branches.length;
    return branches[nextIndex];
  }

  function step(delta: 1 | -1) {
    const next = target(delta);
    if (!next) return;
    setActiveBranchId(next.id);
    window.location.reload();
  }

  return { loaded, branches, current, needsSwitcher, canStep, target, step };
}
