export type Role = "USER" | "MANAGER" | "ADMIN";

export type AppealStatus = "NEW" | "IN_PROGRESS" | "ADVICE_GIVEN" | "CLOSED";

export type IntakeChannel = "PHONE" | "EMAIL" | "MESSENGER" | "IN_PERSON" | "WEBSITE";

export const STATUS_LABELS: Record<AppealStatus, string> = {
  NEW: "Новое",
  IN_PROGRESS: "В работе",
  ADVICE_GIVEN: "Консультация дана",
  CLOSED: "Закрыто",
};

export const INTAKE_LABELS: Record<IntakeChannel, string> = {
  PHONE: "Телефон",
  EMAIL: "Email",
  MESSENGER: "Мессенджер",
  IN_PERSON: "Личный визит",
  WEBSITE: "Сайт",
};

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Пользователь",
  MANAGER: "Менеджер",
  ADMIN: "Администратор",
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
  intake: IntakeChannel;
  clientData: string | null;
  govAssignee: AssigneeRef | null;
  cbAssignee: AssigneeRef | null;
  fsbAssignee: AssigneeRef | null;
  closerAssignee: AssigneeRef | null;
  status: AppealStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
