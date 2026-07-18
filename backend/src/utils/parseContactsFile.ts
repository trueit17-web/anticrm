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

// Reads a phone (+ optional name, + any other columns) list out of a CSV or
// XLSX file. Looks for a recognizable header row first ("Телефон"/"Имя" and
// a few English/alternate spellings); falls back to treating column 1 as
// phone and column 2 as name if no header is found. Any remaining non-empty
// columns are kept as extraInfo. Rows with an empty phone are dropped.
export async function parseContactsFile(buffer: Buffer, originalName: string): Promise<ParsedContact[]> {
  const ext = path.extname(originalName).toLowerCase();
  const rows = ext === ".xlsx" ? await parseXlsx(buffer) : parseCsvBuffer(buffer);
  return rowsToContacts(rows);
}
