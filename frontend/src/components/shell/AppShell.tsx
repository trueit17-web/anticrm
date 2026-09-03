import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useBranchSwitcher } from "../../hooks/useBranchSwitcher";
import { IconAdmin, IconDatabase, IconHeadset, IconLogout, IconPhone, IconStats } from "../icons";

export type AppShellSection = "appeals" | "stats" | "contacts" | "admin";

// The "new" (opt-in, per-user) interface's persistent left icon rail —
// replaces the scattered top-right icon-links (Статистика/Прозвон/Админка/
// Выйти) from the classic header with one always-visible nav, so switching
// between the app's main areas doesn't require hunting in a corner. Only
// rendered for accounts with User.uiVersion === "new" (see the toggle in
// Админка → Пользователи); everyone else keeps the classic per-page header.
export function AppShell({ active, children }: { active: AppShellSection; children: ReactNode }) {
  const { user, logout } = useAuth();
  const { current: currentBranch, loaded } = useBranchSwitcher();
  const contactsModuleEnabled = !loaded || currentBranch === null || currentBranch.contactsEnabled;

  if (!user) return <>{children}</>;

  return (
    <div className="app-shell">
      <nav className="app-rail">
        <Link
          to="/"
          className={`app-rail-item${active === "appeals" ? " app-rail-item-active" : ""}`}
          title="Трубки"
          aria-label="Трубки"
        >
          <IconHeadset width={22} height={22} />
        </Link>
        <Link
          to="/stats"
          className={`app-rail-item${active === "stats" ? " app-rail-item-active" : ""}`}
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
        <div className="app-rail-spacer" />
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
    </div>
  );
}
