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
  contactsEnabled: boolean;
  // The actual key is never sent to the client (write-only) — only whether
  // one is currently set.
  hasDadataApiKey: boolean;
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
  // Set only when this appeal was created via "В трубки" on a Прозвон call
  // card — carries the original uploaded contact's full extraInfo.
  contact: { id: number; extraInfo: string | null } | null;
  // Optimistic-lock counter — sent back as expectedVersion when saving the
  // multi-field edit form, so a conflicting concurrent save is rejected
  // (409) instead of silently overwritten. See HI-10.
  version: number;
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

export interface TfTimeBucket {
  value: string;
  I: number;
  II: number;
  III: number;
  IV: number;
}

export interface SummaryStats {
  today: number;
  week: number;
  total: number;
}

export interface RangeStats {
  total: number;
  byOperator: OperatorStat[];
  byGov: StatBucket[];
  byStatus: StatBucket[];
  byDate: DailyStat[];
  byTf: TfTimeBucket[];
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

export type ContactStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "REACHED"
  | "NOT_REACHED"
  | "DECLINED"
  | "CALLBACK"
  | "ANSWERING_MACHINE"
  | "NOT_PUSHED"
  | "SKIP_ON_CODE";

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  REACHED: "Дозвон",
  NOT_REACHED: "Недозвон",
  DECLINED: "Отказ",
  CALLBACK: "Перезвонить",
  ANSWERING_MACHINE: "АО",
  NOT_PUSHED: "Недожал",
  SKIP_ON_CODE: "Скип на коде",
};

export interface Contact {
  id: number;
  phone: string;
  fullName: string | null;
  extraInfo: string | null;
  status: ContactStatus;
  resultNote: string | null;
  claimedBy: { id: number; fullName: string } | null;
  claimedAt: string | null;
  appealId: number | null;
  createdAt: string;
}

export interface ContactBatch {
  id: number;
  fileName: string;
  totalCount: number;
  uploadedBy: { id: number; fullName: string };
  createdAt: string;
  counts: Partial<Record<ContactStatus, number>>;
}

export interface ContactManagerStat {
  userId: number;
  fullName: string;
  reached: number;
  notReached: number;
  declined: number;
  callback: number;
  answeringMachine: number;
  notPushed: number;
  skipOnCode: number;
  total: number;
}

export interface ContactRangeStats {
  queueTotal: number;
  queueNew: number;
  queueInWork: number;
  reached: number;
  notReached: number;
  declined: number;
  callback: number;
  answeringMachine: number;
  notPushed: number;
  skipOnCode: number;
  handled: number;
  byManager: ContactManagerStat[];
}

export interface SocialFundOffice {
  id: number;
  city: string;
  address: string;
}
