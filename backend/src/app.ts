import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "./config/env";
import { UPLOADS_DIR } from "./config/uploads";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { appealsRouter } from "./modules/appeals/appeals.routes";
import { selectOptionsRouter } from "./modules/select-options/select-options.routes";
import { branchesRouter } from "./modules/branches/branches.routes";
import { contactsRouter } from "./modules/contacts/contacts.routes";

export const app = express();

// In production the app only ever sits behind the nginx container (one hop),
// which sets X-Forwarded-For — needed for express-rate-limit to key on the
// real client IP instead of nginx's. In development the backend is reached
// directly, so trusting a client-supplied X-Forwarded-For would let a caller
// spoof req.ip and dodge the login rate limiter.
if (env.nodeEnv === "production") app.set("trust proxy", 1);

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

// Avatar images etc. — served directly, not behind /api, so they can be
// used as plain <img src> URLs. nosniff stops a browser from ever executing
// a served file as HTML/script even if its declared content-type were ever
// wrong — defense in depth on top of the upload pipeline's own image
// re-encoding (see utils/reencodeImage.ts).
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/appeals", appealsRouter);
app.use("/api/select-options", selectOptionsRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/contacts", contactsRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Не найдено" });
});

// Centralized error handler keeps stack traces out of API responses.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Файл слишком большой" : err.message;
    return res.status(400).json({ error: message });
  }
  // The avatar upload's fileFilter rejects with a plain Error carrying a
  // user-facing Russian message — surface that instead of a generic 500.
  if (err instanceof Error && err.message.startsWith("Допустимы только")) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});
