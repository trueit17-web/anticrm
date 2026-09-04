import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useBranchSwitcher } from "../../hooks/useBranchSwitcher";
import {
  IconAdmin,
  IconBack,
  IconBook,
  IconDatabase,
  IconHeadset,
  IconLogout,
  IconNotepadPencil,
  IconPhone,
  IconPlus,
  IconStats,
  IconTrash,
} from "../icons";
import { InnModule } from "../inn/InnModule";

export type AppShellSection = "appeals" | "stats" | "contacts" | "admin";

// The "new" (opt-in, per-user) interface's persistent left icon rail —
// replaces the scattered top-right icon-links (Статистика/Прозвон/Админка/
// Выйти) from the classic header with one always-visible nav, so switching
// between the app's main areas doesn't require hunting in a corner. Only
// rendered for accounts with User.uiVersion === "new" (see the toggle in
// Админка → Пользователи); everyone else keeps the classic per-page header.
export function AppShell({
  active,
  children,
  onCreateAppeal,
  onToggleTrash,
  trashActive,
}: {
  active: AppShellSection;
  children: ReactNode;
  // Only meaningful when active === "appeals" — lets the Трубки rail slot
  // double as a "new trubka" action while already on that page, instead of
  // linking to the page you're already looking at.
  onCreateAppeal?: () => void;
  // Only meaningful when active === "appeals" — undefined hides the rail
  // item entirely for accounts without delete rights (mirrors the classic
  // header's canDeleteAppeal(user) gate).
  onToggleTrash?: () => void;
  trashActive?: boolean;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const onInnTab = active === "stats" && new URLSearchParams(location.search).get("tab") === "inn";
  const { current: currentBranch, loaded } = useBranchSwitcher();
  const contactsModuleEnabled = !loaded || currentBranch === null || currentBranch.contactsEnabled;
  const innModuleEnabled = !loaded || currentBranch === null || currentBranch.innEnabled;

  if (!user) return <>{children}</>;

  return (
    <div className="app-shell">
      <nav className="app-rail">
        {active === "appeals" && onCreateAppeal ? (
          <button
            type="button"
            className="app-rail-fab"
            title="Новая трубка"
            aria-label="Новая трубка"
            onClick={onCreateAppeal}
          >
            <IconPlus width={22} height={22} />
          </button>
        ) : (
          <Link
            to="/"
            className={`app-rail-item${active === "appeals" ? " app-rail-item-active" : ""}`}
            title="Трубки"
            aria-label="Трубки"
          >
            <IconHeadset width={22} height={22} />
          </Link>
        )}
        <Link
          to="/stats"
          className={`app-rail-item${active === "stats" && !onInnTab ? " app-rail-item-active" : ""}`}
          title="Статистика"
          aria-label="Статистика"
        >
          <IconStats width={22} height={22} />
        </Link>
        {contactsModuleEnabled && (user.role === "MANAGER" || user.role === "ADMIN" || user.role === "SUPERADMIN") && (
          <Link
            to="/contacts"
            className={`app-rail-item${active === "contacts" ? " app-rail-item-active" : ""}`}
            title={user.role === "MANAGER" ? "Прозвон" : "Базы"}
            aria-label={user.role === "MANAGER" ? "Прозвон" : "Базы"}
          >
            {user.role === "MANAGER" ? <IconPhone width={22} height={22} /> : <IconDatabase width={22} height={22} />}
          </Link>
        )}

        {/* Two flex spacers around the ИНН button center it vertically in the
            rail regardless of how many items sit above/below — it's the one
            action every operator reaches for constantly through the day, so
            it gets the middle of the rail and a bigger, unmissable button. */}
        <div className="app-rail-spacer" />
        {innModuleEnabled && (
          <button
            type="button"
            className="app-rail-item-inn"
            title="ИНН"
            aria-label="ИНН"
            onClick={() => document.querySelector<HTMLButtonElement>(".inn-dock-icon")?.click()}
          >
            <IconNotepadPencil width={26} height={26} />
          </button>
        )}
        {/* A second spacer before the journal link (instead of butting it
            right up against the ИНН button) lands it roughly halfway down
            the remaining space to the bottom cluster, not stacked on top of
            ИНН. */}
        {innModuleEnabled && <div className="app-rail-spacer" />}
        {innModuleEnabled && (
          <Link
            to="/stats?tab=inn"
            className={`app-rail-item${onInnTab ? " app-rail-item-active" : ""}`}
            title="Журнал ИНН"
            aria-label="Журнал ИНН"
          >
            <IconBook width={22} height={22} />
          </Link>
        )}
        <div className="app-rail-spacer" />

        {active === "appeals" && onToggleTrash && (
          <button
            type="button"
            className={`app-rail-item${trashActive ? " app-rail-item-active" : ""}`}
            title={trashActive ? "К трубкам" : "Корзина"}
            aria-label={trashActive ? "К трубкам" : "Корзина"}
            onClick={onToggleTrash}
          >
            {trashActive ? <IconBack width={20} height={20} /> : <IconTrash width={20} height={20} />}
          </button>
        )}
        {(user.role === "ADMIN" || user.role === "SUPERADMIN") && (
          <Link
            to="/admin"
            className={`app-rail-item${active === "admin" ? " app-rail-item-active" : ""}`}
            title="Админка"
            aria-label="Админка"
          >
            <IconAdmin width={20} height={20} />
          </Link>
        )}
        <button className="app-rail-item" title="Выйти" aria-label="Выйти" onClick={logout}>
          <IconLogout width={20} height={20} />
        </button>
      </nav>
      <div className="app-shell-content">{children}</div>
      {innModuleEnabled && <InnModule />}
    </div>
  );
}
