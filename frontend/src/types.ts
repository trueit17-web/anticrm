export type Role = "USER" | "MANAGER" | "ADMIN";

export type OptionField = "GOV" | "CB" | "FSB" | "STATUS" | "INTAKE";

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Пользователь",
  MANAGER: "Менеджер",
  ADMIN: "Администратор",
};

export const OPTION_FIELD_LABELS: Record<OptionField, string> = {
  GOV: "Госы",
  CB: "ЦБ",
  FSB: "ФСБ",
  STATUS: "Статус",
  INTAKE: "Прием",
};

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

export interface UserSummary {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface AssigneeRef {
  id: number;
  fullName: string;
  role: Role;
}

export interface Appeal {
  id: number;
  date: string;
  operator: { id: number; fullName: string };
  phone: string;
  intake: string;
  clientData: string | null;
  gov: string | null;
  cb: string | null;
  fsb: string | null;
  closerAssignee: AssigneeRef | null;
  status: string;
  description: string | null;
  smsSentBy: { id: number; fullName: string } | null;
  smsSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorStat {
  operatorId: number;
  fullName: string;
  count: number;
}

export interface DailyStat {
  day: string;
  count: number;
}

export interface SelectOption {
  id: number;
  field: OptionField;
  value: string;
  order: number;
  createdAt: string;
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
