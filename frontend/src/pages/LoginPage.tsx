import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { IconEye, IconEyeOff, IconHeadset, IconLock, IconUser } from "../components/icons";

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card-wrap">
        <div className="auth-badge">
          <IconHeadset width={26} height={26} />
        </div>
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>Зайди - трубку найди!</h1>
          <p className="auth-sub">Войдите, чтобы продолжить работу</p>

          <label className="auth-field">
            <IconUser className="auth-field-icon" width={17} height={17} />
            <input
              placeholder="Логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              autoComplete="username"
            />
          </label>

          <label className="auth-field">
            <IconLock className="auth-field-icon" width={17} height={17} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-field-toggle"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              title={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <IconEyeOff width={17} height={17} /> : <IconEye width={17} height={17} />}
            </button>
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
