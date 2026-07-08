import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { appealsRouter } from "./modules/appeals/appeals.routes";
import { selectOptionsRouter } from "./modules/select-options/select-options.routes";

export const app = express();

// In production the app only ever sits behind the nginx container (one hop),
// which sets X-Forwarded-For — needed for express-rate-limit to key on the
// real client IP instead of nginx's.
app.set("trust proxy", 1);

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/appeals", appealsRouter);
app.use("/api/select-options", selectOptionsRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Не найдено" });
});

// Centralized error handler keeps stack traces out of API responses.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});
