import path from "path";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";

export interface ParsedContact {
  phone: string;
  fullName?: string;
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

  const contacts: ParsedContact[] = [];
  for (const row of dataRows) {
    const phone = (row[phoneIdx] ?? "").toString().trim();
    if (!phone) continue;
    const fullNameRaw = nameIdx >= 0 ? (row[nameIdx] ?? "").toString().trim() : "";
    contacts.push(fullNameRaw ? { phone, fullName: fullNameRaw } : { phone });
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

// Reads a small phone (+ optional name) list out of a CSV or XLSX file. Looks
// for a recognizable header row first ("Телефон"/"Имя" and a few English/
// alternate spellings); falls back to treating column 1 as phone and column
// 2 as name if no header is found. Rows with an empty phone are dropped.
export async function parseContactsFile(buffer: Buffer, originalName: string): Promise<ParsedContact[]> {
  const ext = path.extname(originalName).toLowerCase();
  const rows = ext === ".xlsx" ? await parseXlsx(buffer) : parseCsvBuffer(buffer);
  return rowsToContacts(rows);
}
