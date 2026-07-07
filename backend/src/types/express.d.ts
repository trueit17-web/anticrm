import { Role } from "@prisma/client";

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
