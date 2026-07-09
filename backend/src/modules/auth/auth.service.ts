import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../utils/password";
import { env } from "../../config/env";
import { AuthUser } from "../../types/express";

export class InvalidCredentialsError extends Error {}
export class AccountDisabledError extends Error {}

export async function login(username: string, password: string) {
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

  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    branchId: user.branchId,
  };

  const token = jwt.sign(authUser, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
  return { token, user: authUser };
}
