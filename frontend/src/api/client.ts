const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const TOKEN_KEY = "crm_token";
const BRANCH_KEY = "crm_branch_id";

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

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
