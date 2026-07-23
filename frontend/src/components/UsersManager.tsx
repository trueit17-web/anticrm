import { Fragment, FormEvent, useEffect, useState } from "react";
import { api, ApiError, fileUrl } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Branch, LoginEvent, ROLE_LABELS, Role, UserSummary } from "../types";
import { IconCheck, IconEdit, IconKey, IconX } from "./icons";
import { EmployeeNameButton } from "./EmployeeCard";

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EditUserRow({
  user,
  colSpan,
  onCancel,
  onSaved,
}: {
  user: UserSummary;
  colSpan: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [password, setPassword] = useState("");
  const [telegram, setTelegram] = useState(user.telegram ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const data: { fullName: string; password?: string; telegram: string; bio: string } = {
        fullName,
        telegram,
        bio,
      };
      if (password) data.password = password;
      await api.patch(`/users/${user.id}`, data);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload() {
    if (!avatarFile) return;
    setError(null);
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", avatarFile);
      const res = await api.upload<{ avatarUrl: string }>(`/users/${user.id}/avatar`, formData);
      setAvatarUrl(res.avatarUrl);
      setAvatarFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить фото");
    } finally {
      setAvatarUploading(false);
    }
  }

  const avatarSrc = fileUrl(avatarUrl);

  return (
    <tr>
      <td>{user.username}</td>
      <td colSpan={colSpan}>
        <form className="inline-form" onSubmit={handleSave}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <input
            placeholder="Новый пароль (необязательно)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
          />
          <input
            placeholder="Telegram (@ник)"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
          />
          <textarea
            placeholder="Описание"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
          />
          <button type="submit" className="btn-save" disabled={saving}>
            <IconCheck width={15} height={15} />
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button type="button" className="btn-cancel" onClick={onCancel}>
            <IconX width={15} height={15} />
            Отмена
          </button>
        </form>
        <div className="inline-form">
          {avatarSrc && <img className="employee-card-avatar" src={avatarSrc} alt={fullName} />}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" disabled={!avatarFile || avatarUploading} onClick={handleAvatarUpload}>
            {avatarUploading ? "Загрузка..." : "Загрузить фото"}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </td>
    </tr>
  );
}

function BranchAccessRow({
  user,
  branches,
  colSpan,
  onCancel,
  onSaved,
}: {
  user: UserSummary;
  branches: Branch[];
  colSpan: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(user.branchAccess.map((b) => b.id)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await api.put(`/users/${user.id}/branch-access`, { branchIds: Array.from(selected) });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const otherBranches = branches.filter((b) => b.id !== user.branch?.id);

  return (
    <tr>
      <td>{user.username}</td>
      <td colSpan={colSpan}>
        <p className="muted">
          Доп. филиалы для {user.fullName} (кроме домашнего — {user.branch?.name ?? "—"}):
        </p>
        {otherBranches.length === 0 ? (
          <p className="muted">Других филиалов нет.</p>
        ) : (
          <div className="branch-access-list">
            {otherBranches.map((b) => (
              <label key={b.id} className="branch-access-option">
                <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        )}
        <div className="inline-form">
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            <IconCheck width={15} height={15} />
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button className="btn-cancel" onClick={onCancel}>
            <IconX width={15} height={15} />
            Отмена
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </td>
    </tr>
  );
}

// Backend requires a destination branch whenever a SUPERADMIN (branchId ===
// null) is demoted to any other role — shown instead of the normal role
// <select> so the operator picks that branch in the same action, rather
// than the request just failing with "выберите филиал".
function DemoteSuperadminRow({
  user,
  newRole,
  branches,
  colSpan,
  onCancel,
  onSaved,
}: {
  user: UserSummary;
  newRole: Role;
  branches: Branch[];
  colSpan: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [branchId, setBranchId] = useState<number | "">(branches[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (branchId === "") return;
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, { role: newRole, branchId });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{user.username}</td>
      <td colSpan={colSpan}>
        <p className="muted">
          Супер-администратор не привязан к филиалу — при снятии этой роли у {user.fullName} нужно
          сразу выбрать филиал, в который он перейдёт:
        </p>
        <div className="inline-form">
          <select value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button className="btn-save" onClick={handleConfirm} disabled={saving || branchId === ""}>
            <IconCheck width={15} height={15} />
            {saving ? "Сохранение..." : "Подтвердить"}
          </button>
          <button className="btn-cancel" onClick={onCancel}>
            <IconX width={15} height={15} />
            Отмена
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </td>
    </tr>
  );
}

function LoginHistoryRow({
  userId,
  colSpan,
  onClose,
}: {
  userId: number;
  colSpan: number;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ events: LoginEvent[] }>(`/users/${userId}/login-events`)
      .then((res) => setEvents(res.events))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить"));
  }, [userId]);

  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="login-history">
          <div className="login-history-head">
            <span className="muted">История входов (последние 20)</span>
            <button className="link-button" onClick={onClose}>
              Свернуть
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          {!error && events === null && <p className="muted">Загрузка...</p>}
          {!error && events !== null && events.length === 0 && (
            <p className="muted">Входов пока не было.</p>
          )}
          {!error && events !== null && events.length > 0 && (
            <ul className="login-history-list">
              {events.map((e) => (
                <li key={e.id}>
                  <span>{formatEventTime(e.createdAt)}</span>
                  <span className="muted">{e.ip ?? "—"}</span>
                  <span className="muted login-history-ua" title={e.userAgent ?? undefined}>
                    {e.userAgent ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </td>
    </tr>
  );
}

export function UsersManager() {
  const { user: currentUser } = useAuth();
  const isSuperadmin = currentUser?.role === "SUPERADMIN";
  const assignableRoles = (Object.keys(ROLE_LABELS) as Role[]).filter(
    (r) => r !== "SUPERADMIN" || isSuperadmin
  );

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [accessEditingId, setAccessEditingId] = useState<number | null>(null);
  const [loginHistoryId, setLoginHistoryId] = useState<number | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<{ id: number; role: Role } | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ users: UserSummary[] }>("/users");
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить пользователей");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    if (isSuperadmin) {
      api
        .get<{ branches: Branch[] }>("/branches")
        .then((res) => setBranches(res.branches))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await api.post("/users", { username, password, fullName, role });
      setUsername("");
      setPassword("");
      setFullName("");
      setRole("USER");
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать пользователя");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: UserSummary) {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await loadUsers();
  }

  async function changeRole(u: UserSummary, newRole: Role) {
    if (u.role === "SUPERADMIN" && newRole !== "SUPERADMIN") {
      setDemoteTarget({ id: u.id, role: newRole });
      return;
    }
    await api.patch(`/users/${u.id}`, { role: newRole });
    await loadUsers();
  }

  const editColSpan = isSuperadmin ? 5 : 3;
  const totalColumns = isSuperadmin ? 7 : 5;

  return (
    <div>
      {isSuperadmin && (
        <p className="muted">
          Новый сотрудник регистрируется в филиал, выбранный переключателем слева от заголовка
          страницы. Доступ к дополнительным филиалам настраивается кнопкой «Доступ» в строке
          сотрудника.
        </p>
      )}

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          placeholder="Логин"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <input
          placeholder="Имя сотрудника"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {assignableRoles.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={creating}>
          {creating ? "Создание..." : "Добавить сотрудника"}
        </button>
      </form>
      {formError && <p className="error-text">{formError}</p>}

      {loading && <p>Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll fit-content">
          <table className="appeals-table table-auto">
            <thead>
              <tr>
                <th>🔑 Логин</th>
                <th>👤 Имя</th>
                <th className="col-center">🎭 Роль</th>
                {isSuperadmin && <th>🏢 Филиал</th>}
                {isSuperadmin && <th>🔐 Доп. доступ</th>}
                <th className="col-center">🚦 Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                if (editingId === u.id) {
                  return (
                    <EditUserRow
                      key={u.id}
                      user={u}
                      colSpan={editColSpan}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        loadUsers();
                      }}
                    />
                  );
                }
                if (demoteTarget?.id === u.id) {
                  return (
                    <DemoteSuperadminRow
                      key={u.id}
                      user={u}
                      newRole={demoteTarget.role}
                      branches={branches}
                      colSpan={editColSpan}
                      onCancel={() => setDemoteTarget(null)}
                      onSaved={() => {
                        setDemoteTarget(null);
                        loadUsers();
                      }}
                    />
                  );
                }
                if (accessEditingId === u.id) {
                  return (
                    <BranchAccessRow
                      key={u.id}
                      user={u}
                      branches={branches}
                      colSpan={editColSpan}
                      onCancel={() => setAccessEditingId(null)}
                      onSaved={() => {
                        setAccessEditingId(null);
                        loadUsers();
                      }}
                    />
                  );
                }
                const historyOpen = loginHistoryId === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr>
                      <td>{u.username}</td>
                      <td>
                        <EmployeeNameButton id={u.id} fullName={u.fullName} />
                      </td>
                      <td className="col-center">
                        <select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)}>
                          {assignableRoles.map((value) => (
                            <option key={value} value={value}>
                              {ROLE_LABELS[value]}
                            </option>
                          ))}
                        </select>
                      </td>
                      {isSuperadmin && <td>{u.branch?.name ?? "—"}</td>}
                      {isSuperadmin && (
                        <td>{u.branchAccess.length > 0 ? u.branchAccess.map((b) => b.name).join(", ") : "—"}</td>
                      )}
                      <td className="col-center">{u.active ? "Активен" : "Отключён"}</td>
                      <td>
                        <button
                          className="icon-btn"
                          title="Редактировать"
                          aria-label="Редактировать"
                          onClick={() => setEditingId(u.id)}
                        >
                          <IconEdit width={16} height={16} />
                        </button>{" "}
                        {isSuperadmin && (
                          <button
                            className="icon-btn"
                            title="Доступ к филиалам"
                            aria-label="Доступ к филиалам"
                            onClick={() => setAccessEditingId(u.id)}
                          >
                            <IconKey width={16} height={16} />
                          </button>
                        )}{" "}
                        <button
                          className="link-button"
                          onClick={() => setLoginHistoryId(historyOpen ? null : u.id)}
                        >
                          {historyOpen ? "Скрыть входы" : "История входов"}
                        </button>{" "}
                        <button className="link-button" onClick={() => toggleActive(u)}>
                          {u.active ? "Отключить" : "Включить"}
                        </button>
                      </td>
                    </tr>
                    {historyOpen && (
                      <LoginHistoryRow
                        userId={u.id}
                        colSpan={totalColumns}
                        onClose={() => setLoginHistoryId(null)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
