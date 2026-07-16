import fs from "fs";
import path from "path";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
export const AVATARS_DIR = path.join(UPLOADS_DIR, "avatars");

fs.mkdirSync(AVATARS_DIR, { recursive: true });
