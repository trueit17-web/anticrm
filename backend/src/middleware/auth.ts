import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";

interface SessionPayload {
  id: number;
  sessionVersion: number;
}

// A JWT only carries { id, sessionVersion } — the rest of the account (role,
// branch, active flag) is read fresh from the DB on every request. This is
// what lets logging in from a new place invalidate any token issued before
// it: login() bumps User.sessionVersion, and any older token's embedded
// value stops matching, so it's rejected here instead of trusting stale
// claims for up to JWT_EXPIRES_IN.
export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Не авторизован" });
    return;
  }

  const token = header.slice("Bearer ".length);
  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as SessionPayload;
  } catch {
    res.status(401).json({ error: "Недействительный или истёкший токен" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { branch: true } });
  if (!user || !user.active || user.sessionVersion !== payload.sessionVersion) {
    res.status(401).json({ error: "Сессия завершена — выполнен вход с другого устройства" });
    return;
  }

  req.user = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
  };
  next();
});

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Не авторизован" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    next();
  };
}
