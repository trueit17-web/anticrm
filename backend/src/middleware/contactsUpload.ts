import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";

const ALLOWED_MIME = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ALLOWED_EXT = new Set([".csv", ".xlsx"]);

// Kept in memory, not written to disk — the file is only needed long enough
// to parse phone numbers out of it, unlike avatars which persist.
const storage = multer.memoryStorage();

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  // Browsers are inconsistent about the MIME type they send for CSV (often
  // "application/octet-stream"), so the extension is checked as a fallback
  // rather than trusting mimetype alone.
  if (!ALLOWED_MIME.has(file.mimetype) && !ALLOWED_EXT.has(ext)) {
    cb(new Error("Допустимы только файлы CSV или Excel (.csv, .xlsx)"));
    return;
  }
  cb(null, true);
}

export const contactsUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});
