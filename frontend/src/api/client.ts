const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

// Uploaded files (avatars etc.) are served from the API origin, but outside
// the "/api" prefix — this strips it so <img src> can point at them directly.
const FILE_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${FILE_ORIGIN}${path}`;
}

const TOKEN_KEY = "crm_token";
const BRANCH_KEY = "crm_branch_id";
const SELECTED_DATE_KEY = "crm_selected_date";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Which branch the app is currently acting on. Only matters for accounts
// that can switch branches (SUPERADMIN, or a manager granted extra branch
// access) — the backend falls back to the account's home branch for anyone
// else, so it's safe to always send it.
export function getActiveBranchId(): number | null {
  const v = localStorage.getItem(BRANCH_KEY);
  return v ? Number(v) : null;
}

export function setActiveBranchId(id: number | null): void {
  if (id === null) localStorage.removeItem(BRANCH_KEY);
  else localStorage.setItem(BRANCH_KEY, String(id));
}

// SUPERADMIN picks which date's trubki to browse from the Админка page (see
// AdminPage.tsx); the main trubki page (AppealsPage.tsx) just reads it back.
// Every other role always works off today's date regardless of what's
// stored here — callers gate reads/writes to SUPERADMIN themselves.
export function getSelectedDate(): string | null {
  return localStorage.getItem(SELECTED_DATE_KEY);
}

export function setSelectedDate(date: string): void {
  localStorage.setItem(SELECTED_DATE_KEY, date);
}

function withBranchParam(path: string): string {
  const branchId = getActiveBranchId();
  if (branchId === null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}branchId=${branchId}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${withBranchParam(path)}`, { ...options, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "Ошибка запроса");
  }

  return body as T;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  // No Content-Type here — the browser sets multipart/form-data with the
  // right boundary itself; setting it manually would break the upload.
  const res = await fetch(`${API_URL}${withBranchParam(path)}`, {
    method: "POST",
    headers,
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "Ошибка запроса");
  }
  return body as T;
}

// For endpoints that return a file instead of JSON (e.g. CSV export) — the
// request still needs the auth header, so a plain <a href> can't be used.
async function download(path: string, filename: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${withBranchParam(path)}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "Ошибка запроса");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, options?: RequestInit) => request<T>(path, options),
  post: <T>(path: string, data?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: "DELETE" }),
  upload,
  download,
};
