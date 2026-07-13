import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginHandler, meHandler } from "./auth.controller";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const authRouter = Router();

// Blunt defense against password-guessing/credential stuffing on the one
// endpoint that doesn't already require a valid token. Keyed by IP+username
// rather than IP alone — coworkers in the same office share one public IP
// via NAT, so a plain per-IP limit means one person's failed attempts (or
// everyone re-logging in after a deploy) locks out the whole office. Scoping
// to the attempted account keeps the brute-force protection per-account
// without that false-positive.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Попробуйте позже." },
  keyGenerator: (req) => `${req.ip}:${String(req.body?.username ?? "")}`,
});

authRouter.post("/login", loginLimiter, asyncHandler(loginHandler));
authRouter.get("/me", requireAuth, meHandler);
