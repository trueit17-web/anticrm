import { Request } from "express";
import multer, { FileFilterCallback } from "multer";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Memory storage on purpose: the client-declared MIME/filename can't be
// trusted (see fileFilter below), so nothing here ever gets written to disk
// under an attacker-influenced name or extension. The handler decodes the
// buffer with sharp and picks the on-disk name itself (see
// utils/reencodeImage.ts + users.controller.ts's uploadAvatarHandler).
const storage = multer.memoryStorage();

// Coarse, cheap pre-filter only — real validation happens when the buffer
// is decoded as an image (reencodeToWebp). A client can lie about
// Content-Type, so this alone must never be treated as proof of file type.
function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(new Error("Допустимы только изображения JPEG, PNG, WebP или GIF"));
    return;
  }
  cb(null, true);
}

export const avatarUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});
