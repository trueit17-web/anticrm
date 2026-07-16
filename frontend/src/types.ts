export type Role = "USER" | "MANAGER" | "ADMIN" | "SUPERADMIN";

export type OptionField = "GOV" | "CB" | "FSB" | "CLOSER" | "STATUS" | "TF";

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Пользователь",
  MANAGER: "Менеджер",
  ADMIN: "Администратор",
  SUPERADMIN: "Суперадминистратор",
};

export const OPTION_FIELD_LABELS: Record<OptionField, string> = {
  GOV: "Госы",
  CB: "ЦБ",
  FSB: "ФСБ",
  CLOSER: "Закрыв",
  STATUS: "Статус",
  TF: "ТФ",
};

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  branchId: number | null;
  branchName: string | null;
}

export interface UserSummary {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  avatarUrl: string | null;
  telegram: string | null;
  bio: string | null;
  branch: { id: number; name: string } | null;
  // Extra branches this user can switch into beyond their home branch.
  branchAccess: { id: number; name: string }[];
}

export interface Branch {
  id: number;
  name: string;
  createdAt: string;
}

export interface Appeal {
  id: number;
  date: string;
  operator: { id: number; fullName: string };
  phone: string;
  intake: boolean;
  clientData: string | null;
  dep: string | null;
  reportedTime: string | null;
  gov: string | null;
  cb: string | null;
  fsb: string | null;
  closer: string | null;
  tf: string | null;
  status: string;
  description: string | null;
  smsSentBy: { id: number; fullName: string } | null;
  smsSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OperatorStat {
  operatorId: number;
  fullName: string;
  avatarUrl: string | null;
  count: number;
}

export interface DailyStat {
  day: string;
  count: number;
}

export interface StatBucket {
  value: string;
  count: number;
}

export interface RangeStats {
  total: number;
  byOperator: OperatorStat[];
  byGov: StatBucket[];
  byStatus: StatBucket[];
  byDate: DailyStat[];
}

export interface SelectOption {
  id: number;
  field: OptionField;
  value: string;
  order: number;
  color: string | null;
  // Only meaningful for field "STATUS": the status a new trubka gets when
  // none is set explicitly.
  isDefault: boolean;
  createdAt: string;
}

export interface LoginEvent {
  id: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface UserCard {
  id: number;
  fullName: string;
  avatarUrl: string | null;
  telegram: string | null;
  bio: string | null;
  stats: { today: number; week: number; total: number };
}

export interface HistoryEntry {
  id: number;
  field: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedBy: { id: number; fullName: string };
}
