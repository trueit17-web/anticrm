export type Role = "USER" | "MANAGER" | "ADMIN" | "SUPERADMIN";

export type OptionField = "GOV" | "CB" | "FSB" | "CLOSER" | "STATUS" | "TF" | "INN_CATEGORY";

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
  INN_CATEGORY: "Категория ИНН",
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
  // Hidden from the operator ranking on the Statistics page when true.
  excludedFromStats: boolean;
  createdAt: string;
  avatarUrl: string | null;
  telegram: string | null;
  bio: string | null;
  branch: { id: number; name: string } | null;
  // Extra branches this user can switch into beyond their home branch.
  branchAccess: { id: number; name: string }[];
  // Timestamp of the most recent successful login, or null if never logged in.
  lastLoginAt: string | null;
}

export interface Branch {
  id: number;
  name: string;
  createdAt: string;
  contactsEnabled: boolean;
  // "Считать кош" module toggle (SUPERADMIN, Филиалы page).
  walletCountEnabled: boolean;
  // "Питомец" (AI mascot) module toggle (SUPERADMIN, Филиалы page).
  petEnabled: boolean;
  // "ИНН" module toggle (SUPERADMIN, Филиалы page).
  innEnabled: boolean;
  // The actual key is never sent to the client (write-only) — only whether
  // one is currently set.
  hasDadataApiKey: boolean;
}

// --- "ИНН" module ---

export interface InnEntry {
  id: number;
  date: string;
  inn: string;
  companyName: string | null;
  region: string | null;
  contactsCount: number;
  transferredCount: number;
  called: boolean;
  category: string | null;
  note: string | null;
  operatorId: number;
  warningLevel: "red" | "yellow" | null;
  createdAt: string;
  updatedAt: string;
}

export interface InnStatsMine {
  totalEntries: number;
  totalContacts: number;
  totalTransferred: number;
  totalCalled: number;
}

export interface InnStatsSummary extends InnStatsMine {
  totalRepeats: number;
  byOperator: {
    operatorId: number;
    operatorName: string;
    entries: number;
    contacts: number;
    transferred: number;
    repeats: number;
    called: number;
  }[];
}

export interface InnEntryWithOperator extends InnEntry {
  operatorName: string;
}

export interface InnCheckResult {
  warningLevel: "red" | "yellow" | null;
  lastDate: string | null;
}

// --- "Питомец" (AI mascot assistant) ---

export type PetTrigger =
  | "no_sms"
  | "big_dep"
  | "nedozhal"
  | "stalled"
  | "status"
  | "daily_count"
  | "phone_operator"
  | "custom";
export type PetSkin = "fox" | "robot" | "frog" | "cat";

export interface PetProfile {
  name: string;
  skin: PetSkin;
  // 0 = quiet, 1 = normal, 2 = chatty (controls the ambient tip interval).
  chattiness: number;
  // Stage 5: optional AI layer (OpenRouter) — a couple of fresh tips based on
  // obscured shift aggregates, mixed into the rule-based rotation.
  aiEnabled: boolean;
  // Write-only secret: only whether a key is currently set, never the key itself.
  hasOpenRouterApiKey: boolean;
}

export interface PetRule {
  id: number;
  trigger: PetTrigger;
  // For trigger "status": the exact branch status value to react to.
  param: string | null;
  message: string;
  enabled: boolean;
}

export interface PetConfig {
  enabled: boolean;
  profile: PetProfile;
  rules: PetRule[];
}

export interface WalletRecipient {
  id: number;
  address: string;
  name: string;
  // A "hub" (сборный кош) — payments to any address that sweeps into it are
  // attributed to this recipient, so rotating deposit addresses aren't each
  // mapped by hand.
  isHub: boolean;
}

export interface WalletRecipientStat {
  name: string;
  amount: number;
  count: number;
}

export interface WalletHubSuggestion {
  address: string;
  fromCount: number;
}

export interface WalletStats {
  sources: string[];
  total: number;
  count: number;
  byRecipient: WalletRecipientStat[];
  suggestedHubs: WalletHubSuggestion[];
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
