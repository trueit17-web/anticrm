import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../utils/password";
import { env } from "../../config/env";
import { AuthUser } from "../../types/express";

export class InvalidCredentialsError extends Error {}
export class AccountDisabledError extends Error {}

export async function login(
  username: string,
  password: string,
  meta: { ip: string | null; userAgent: string | null }
) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new InvalidCredentialsError();
  }
  if (!user.active) {
    throw new AccountDisabledError();
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new InvalidCredentialsError();
  }

  // Bumping sessionVersion invalidates any token issued before this login —
  // only the most recently issued one keeps working, everywhere else this
  // account was logged in gets "session ended" on its next request.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });

  await prisma.loginEvent.create({
    data: { userId: user.id, ip: meta.ip, userAgent: meta.userAgent },
  });

  const authUser: AuthUser = {
    id: updated.id,
    username: updated.username,
    fullName: updated.fullName,
    role: updated.role,
    branchId: updated.branchId,
  };

  const token = jwt.sign({ id: updated.id, sessionVersion: updated.sessionVersion }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
  return { token, user: authUser };
}
