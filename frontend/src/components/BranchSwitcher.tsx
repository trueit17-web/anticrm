import { useBranchSwitcher } from "../hooks/useBranchSwitcher";

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
  const { loaded, current, needsSwitcher, canStep, target, step } = useBranchSwitcher();

  if (!loaded || !needsSwitcher) return null;

  // Only worth naming the destination when there's actually somewhere else
  // to go — with a single branch, target() just returns the current one.
  const prevLabel = canStep && target(-1) ? `Перейти к ${target(-1)!.name}` : "Предыдущий филиал";
  const nextLabel = canStep && target(1) ? `Перейти к ${target(1)!.name}` : "Следующий филиал";

  return (
    <div className="branch-switcher" title="Выбранный филиал">
      <button
        type="button"
        className="branch-switcher-btn"
        onClick={() => step(-1)}
        disabled={!canStep}
        aria-label={prevLabel}
        title={prevLabel}
      >
        ‹
      </button>
      <span className="branch-switcher-name">{current?.name ?? "Выберите филиал"}</span>
      <button
        type="button"
        className="branch-switcher-btn"
        onClick={() => step(1)}
        disabled={!canStep}
        aria-label={nextLabel}
        title={nextLabel}
      >
        ›
      </button>
    </div>
  );
}
