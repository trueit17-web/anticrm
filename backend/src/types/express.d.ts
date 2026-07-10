import { Role } from "@prisma/client";

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  // Null only for SUPERADMIN accounts, which aren't tied to one branch.
  branchId: number | null;
  branchName: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
