import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginHandler, meHandler } from "./auth.controller";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const authRouter = Router();

// Blunt defense against password-guessing/credential stuffing on the one
// endpoint that doesn't already require a valid token.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Попробуйте позже." },
});

authRouter.post("/login", loginLimiter, asyncHandler(loginHandler));
authRouter.get("/me", requireAuth, meHandler);
