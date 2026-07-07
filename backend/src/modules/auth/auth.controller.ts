import { Request, Response } from "express";
import { z } from "zod";
import { AccountDisabledError, InvalidCredentialsError, login } from "./auth.service";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Укажите логин и пароль" });
  }

  try {
    const result = await login(parsed.data.username, parsed.data.password);
    return res.json(result);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    if (err instanceof AccountDisabledError) {
      return res.status(403).json({ error: "Учётная запись отключена" });
    }
    throw err;
  }
}

export function meHandler(req: Request, res: Response) {
  res.json({ user: req.user });
}
