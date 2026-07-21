import path from "path";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";

export interface ParsedContact {
  phone: string;
  fullName?: string;
  // Any other non-empty columns, flattened to "Header: value; Header: value"
  // (or just "value; value" when the file has no header row).
  extraInfo?: string;
}

const PHONE_HEADERS = ["телефон", "phone", "номер", "номер телефона"];
const NAME_HEADERS = ["имя", "фио", "ф.и.о.", "name", "клиент"];

function detectColumns(headerRow: string[]): { phoneIdx: number; nameIdx: number } | null {
  const normalized = headerRow.map((c) => (c ?? "").trim().toLowerCase());
  const phoneIdx = normalized.findIndex((c) => PHONE_HEADERS.includes(c));
  if (phoneIdx === -1) return null;
  const nameIdx = normalized.findIndex((c) => NAME_HEADERS.includes(c));
  return { phoneIdx, nameIdx };
}

function rowsToContacts(rows: string[][]): ParsedContact[] {
  if (rows.length === 0) return [];

  const header = detectColumns(rows[0]);
  const phoneIdx = header?.phoneIdx ?? 0;
  const nameIdx = header?.nameIdx ?? 1;
  const dataRows = header ? rows.slice(1) : rows;
  const headerRow = header ? rows[0] : null;

  const contacts: ParsedContact[] = [];
  for (const row of dataRows) {
    const phone = (row[phoneIdx] ?? "").toString().trim();
    if (!phone) continue;
    const fullNameRaw = nameIdx >= 0 ? (row[nameIdx] ?? "").toString().trim() : "";

    const extraParts: string[] = [];
    for (let i = 0; i < row.length; i++) {
      if (i === phoneIdx || i === nameIdx) continue;
      const value = (row[i] ?? "").toString().trim();
      if (!value) continue;
      const label = headerRow?.[i]?.toString().trim();
      extraParts.push(label ? `${label}: ${value}` : value);
    }

    const contact: ParsedContact = { phone };
    if (fullNameRaw) contact.fullName = fullNameRaw;
    if (extraParts.length > 0) contact.extraInfo = extraParts.join("; ");
    contacts.push(contact);
  }
  return contacts;
}

// "Пробив"-style text export: one field per line as "Метка: значение",
// records separated by a "-----" divider line. Older exports that omit the
// divider are still handled by falling back to a repeated "Имя:" line as
// the start of the next record.
const TXT_NAME_LABELS = ["имя"];
const TXT_BIRTH_DATE_LABELS = ["дата рождения"];
const TXT_MAIN_PHONE_LABELS = ["основной номер"];
const TXT_EXTRA_PHONE_LABELS = ["номер телефона"];

interface TxtField {
  label: string | null;
  value: string;
}

function isDashSeparator(line: string): boolean {
  return /^-{3,}$/.test(line);
}

function lineToField(line: string): TxtField {
  const sep = line.indexOf(":");
  if (sep === -1) return { label: null, value: line };
  return { label: line.slice(0, sep).trim(), value: line.slice(sep + 1).trim() };
}

function splitTxtRecords(text: string): TxtField[][] {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.some(isDashSeparator)) {
    const records: TxtField[][] = [];
    let current: TxtField[] = [];
    for (const line of lines) {
      if (isDashSeparator(line)) {
        if (current.length > 0) records.push(current);
        current = [];
        continue;
      }
      current.push(lineToField(line));
    }
    if (current.length > 0) records.push(current);
    return records;
  }

  const records: TxtField[][] = [];
  let current: TxtField[] = [];
  for (const line of lines) {
    const field = lineToField(line);
    if (field.label && TXT_NAME_LABELS.includes(field.label.toLowerCase()) && current.length > 0) {
      records.push(current);
      current = [];
    }
    current.push(field);
  }
  if (current.length > 0) records.push(current);
  return records;
}

// Source files sometimes tag a phone with an occurrence count in
// parentheses, e.g. "79261234567 (3)" — that annotation isn't part of the
// number and is dropped.
function stripPhoneAnnotation(raw: string): string {
  return raw.replace(/\(\s*\d+\s*\)/g, " ").replace(/\s+/g, " ").trim();
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function txtRecordToContact(fields: TxtField[]): ParsedContact | null {
  let fullName: string | undefined;
  const extraParts: string[] = [];
  const phoneEntries: { value: string; isMain: boolean }[] = [];

  for (const f of fields) {
    if (f.label === null || !f.value) continue;
    const labelLower = f.label.trim().toLowerCase().replace(/\.$/, "");

    if (TXT_NAME_LABELS.includes(labelLower)) {
      fullName = f.value;
    } else if (TXT_BIRTH_DATE_LABELS.includes(labelLower)) {
      extraParts.push(`Дата рождения: ${f.value}`);
    } else if (TXT_MAIN_PHONE_LABELS.includes(labelLower)) {
      const phone = stripPhoneAnnotation(f.value);
      if (phone) phoneEntries.push({ value: phone, isMain: true });
    } else if (TXT_EXTRA_PHONE_LABELS.includes(labelLower)) {
      const phone = stripPhoneAnnotation(f.value);
      if (phone) phoneEntries.push({ value: phone, isMain: false });
    } else {
      extraParts.push(`${f.label.trim()}: ${f.value}`);
    }
  }

  // Duplicate phone numbers (same digits, whether repeated "Номер телефона"
  // lines or one that just repeats "Основной номер") are kept only once.
  const seenDigits = new Set<string>();
  let mainPhone: string | undefined;
  for (const entry of phoneEntries) {
    const digits = digitsOnly(entry.value);
    if (digits && !seenDigits.has(digits) && entry.isMain) {
      mainPhone = entry.value;
      seenDigits.add(digits);
      break;
    }
  }
  if (!mainPhone) {
    for (const entry of phoneEntries) {
      const digits = digitsOnly(entry.value);
      if (digits) {
        mainPhone = entry.value;
        seenDigits.add(digits);
        break;
      }
    }
  }
  if (!mainPhone) return null;

  const extraPhones: string[] = [];
  for (const entry of phoneEntries) {
    const digits = digitsOnly(entry.value);
    if (!digits || seenDigits.has(digits)) continue;
    seenDigits.add(digits);
    extraPhones.push(entry.value);
  }
  if (extraPhones.length > 0) extraParts.push(`Доп номера: ${extraPhones.join(", ")}`);

  const contact: ParsedContact = { phone: mainPhone };
  if (fullName) contact.fullName = fullName;
  if (extraParts.length > 0) contact.extraInfo = extraParts.join("; ");
  return contact;
}

function parseTxt(text: string): ParsedContact[] {
  return splitTxtRecords(text)
    .map(txtRecordToContact)
    .filter((c): c is ParsedContact => c !== null);
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    // row.values is 1-indexed (index 0 is unused), so slice it off.
    const cells = (row.values as ExcelJS.CellValue[]).slice(1).map((v) => (v == null ? "" : String(v)));
    rows.push(cells);
  });
  return rows;
}

function parseCsvBuffer(buffer: Buffer): string[][] {
  return parseCsv(buffer, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as string[][];
}

// Reads a phone (+ optional name, + any other columns) list out of a CSV,
// XLSX, or TXT file. CSV/XLSX: looks for a recognizable header row first
// ("Телефон"/"Имя" and a few English/alternate spellings); falls back to
// treating column 1 as phone and column 2 as name if no header is found.
// TXT: "пробив"-style "Метка: значение" records (see parseTxt above). Any
// remaining non-empty fields are kept as extraInfo. Contacts with no usable
// phone are dropped.
export async function parseContactsFile(buffer: Buffer, originalName: string): Promise<ParsedContact[]> {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".txt") return parseTxt(buffer.toString("utf8"));
  const rows = ext === ".xlsx" ? await parseXlsx(buffer) : parseCsvBuffer(buffer);
  return rowsToContacts(rows);
}
